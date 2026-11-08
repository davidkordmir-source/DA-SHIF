import type { AppData, Person, Shift, Swap, AttendanceStatus } from "../types";
import { dayDistance, dayOfWeek, eventsFor, monthDates } from "./calendar";

export const workingIds = (s: Shift) => [
  ...s.primary.filter(
    (id) =>
      !s.attendance.some((a) => a.personId === id && a.status !== "present"),
  ),
  ...s.attendance.flatMap((a) => (a.replacementId ? [a.replacementId] : [])),
];

export function personStats(
  personId: string,
  shifts: Shift[],
  data: Pick<AppData, "events" | "settings">,
) {
  const assigned = shifts.filter((s) => s.primary.includes(personId));
  const attended = shifts
    .flatMap((s) => s.attendance)
    .filter((a) => a.personId === personId);
  const workload = shifts.filter((s) => workingIds(s).includes(personId));
  return {
    total: assigned.length,
    holiday: assigned.filter(
      (s) => eventsFor(s.date, data.events, data.settings.hijriOffset).holiday,
    ).length,
    friday: assigned.filter((s) => dayOfWeek(s.date) === 6).length,
    weekdays: Array.from(
      { length: 7 },
      (_, day) => assigned.filter((s) => dayOfWeek(s.date) === day).length,
    ),
    reserve: shifts.filter((s) => s.reserve.includes(personId)).length,
    present: attended.filter((a) => a.status === "present").length,
    excused: attended.filter((a) => a.status === "excused").length,
    unexcused: attended.filter((a) => a.status === "unexcused").length,
    replacements: shifts.filter((s) =>
      s.attendance.some((a) => a.replacementId === personId),
    ).length,
    workload: workload.length,
    workloadHoliday: workload.filter(
      (s) => eventsFor(s.date, data.events, data.settings.hijriOffset).holiday,
    ).length,
    workloadFriday: workload.filter((s) => dayOfWeek(s.date) === 6).length,
    workloadWeekdays: Array.from(
      { length: 7 },
      (_, day) => workload.filter((s) => dayOfWeek(s.date) === day).length,
    ),
  };
}

// Assign the scarce holiday/weekday slots first. Counts include all saved history.
// A constrained-first pass gives each person a chance before filling ordinary days.
export function generateSchedule(data: AppData, year: number, month: number) {
  const dates = monthDates(year, month);
  const dateSet = new Set(dates);
  if (
    data.shifts.some((s) => dateSet.has(s.date) && s.attendance.length) ||
    data.swaps.some(
      (s) => dateSet.has(s.firstDate) || dateSet.has(s.secondDate),
    )
  )
    throw new Error(
      "ماه دارای سوابق حضور، غیبت یا جابه‌جایی قابل بازتولید نیست.",
    );
  const history = data.shifts.filter((s) => !dateSet.has(s.date));
  const active = data.people.filter((p) => p.active);
  const primaryPool = active.filter((p) => !p.reserveOnly);
  if (primaryPool.length < data.settings.primaryCount)
    throw new Error("تعداد نیروهای فعال اصلی از ظرفیت روزانه کمتر است.");
  if (active.length < data.settings.primaryCount + data.settings.reserveCount)
    throw new Error(
      "برای نیروی اصلی و رزرو، نفرات فعال کافی نیستند. هر نفر فقط یک نقش در هر روز دارد.",
    );
  const shifts: Shift[] = dates.map((date) => ({
    date,
    primary: [],
    reserve: [],
    attendance: [],
  }));
  const all = [...history, ...shifts];
  const stats = new Map(
    active.map((p) => {
      const s = personStats(p.id, history, data);
      return [
        p.id,
        {
          ...s,
          total: s.workload,
          holiday: s.workloadHoliday,
          friday: s.workloadFriday,
          weekdays: s.workloadWeekdays,
        },
      ];
    }),
  );
  const warnings: string[] = [];
  const ordered = [...shifts].sort((a, b) => {
    const ah = eventsFor(
      a.date,
      data.events,
      data.settings.hijriOffset,
    ).holiday;
    const bh = eventsFor(
      b.date,
      data.events,
      data.settings.hijriOffset,
    ).holiday;
    return Number(bh) - Number(ah) || a.date.localeCompare(b.date);
  });
  for (const shift of ordered) {
    const day = dayOfWeek(shift.date);
    const info = eventsFor(shift.date, data.events, data.settings.hijriOffset);
    for (let slot = 0; slot < data.settings.primaryCount; slot++) {
      const pool = primaryPool.filter((p) => !shift.primary.includes(p.id));
      const nearby = (p: Person) =>
        all.filter(
          (s) =>
            workingIds(s).includes(p.id) &&
            Math.abs(dayDistance(s.date, shift.date)) <=
              data.settings.minRestDays,
        );
      const rested = pool.filter((p) => nearby(p).length === 0);
      const candidates = rested.length ? rested : pool;
      if (!rested.length)
        warnings.push(
          `${shift.date}: فاصلهٔ استراحت برای یک نفر قابل رعایت نبود.`,
        );
      const score = (p: Person) => {
        const st = stats.get(p.id)!;
        // Holiday equality has priority on holidays; total and weekday history
        // keep normal days balanced. No random shuffle changes recorded results.
        const balance = info.holiday
          ? st.holiday * 120 +
            st.friday * (info.friday ? 35 : 0) +
            st.total * 18
          : st.total * 100;
        const tie =
          ((Number(shift.date.replaceAll("-", "")) +
            [...p.id].reduce((s, c) => s + c.charCodeAt(0), 0) * 31) %
            97) /
          1000;
        return balance + st.weekdays[day] * 12 + nearby(p).length * 10000 + tie;
      };
      candidates.sort(
        (a, b) => score(a) - score(b) || a.id.localeCompare(b.id),
      );
      const chosen = candidates[0];
      shift.primary.push(chosen.id);
      const st = stats.get(chosen.id)!;
      st.total++;
      st.weekdays[day]++;
      if (info.holiday) st.holiday++;
      if (info.friday) st.friday++;
    }
  }
  // Reserves are always distinct from the day's primary staff and each other.
  for (const shift of shifts) {
    const candidates = active.filter((p) => !shift.primary.includes(p.id));
    candidates.sort((a, b) => {
      const score = (p: Person) => {
        const nearbyDuty = all.filter(
          (s) =>
            workingIds(s).includes(p.id) &&
            Math.abs(dayDistance(s.date, shift.date)) <=
              data.settings.minRestDays,
        ).length;
        return stats.get(p.id)!.reserve * 100 + nearbyDuty * 10000;
      };
      return score(a) - score(b) || a.id.localeCompare(b.id);
    });
    for (const p of candidates.slice(0, data.settings.reserveCount)) {
      shift.reserve.push(p.id);
      stats.get(p.id)!.reserve++;
    }
  }
  return {
    shifts: [...history, ...shifts].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    warnings,
  };
}

export function validateSwap(
  data: AppData,
  firstDate: string,
  firstId: string,
  secondDate: string,
  secondId: string,
) {
  if (!firstId || !secondId || firstId === secondId)
    throw new Error("دو نفر متفاوت انتخاب کنید.");
  const first = data.shifts.find((s) => s.date === firstDate),
    second = data.shifts.find((s) => s.date === secondDate);
  if (
    !first?.primary.includes(firstId) ||
    !second ||
    !(firstDate === secondDate
      ? second.reserve.includes(secondId)
      : second.primary.includes(secondId))
  )
    throw new Error(
      "نفر اول باید نیروی اصلی باشد؛ نفر دوم در همان روز از رزروها و در روز دیگر از نیروهای اصلی انتخاب می‌شود.",
    );
  if (
    first.attendance.some((a) => a.personId === firstId) ||
    second.attendance.some((a) => a.personId === secondId)
  )
    throw new Error("شیفت دارای سابقهٔ حضور یا غیبت قابل جابه‌جایی نیست.");
  if (
    first.attendance.some(
      (a) => a.replacementId === firstId || a.replacementId === secondId,
    ) ||
    second.attendance.some(
      (a) => a.replacementId === firstId || a.replacementId === secondId,
    )
  )
    throw new Error("نیروی دارای سابقهٔ جایگزینی قابل جابه‌جایی نیست.");
  if (
    !data.people.find((p) => p.id === secondId)?.active ||
    (firstDate !== secondDate &&
      !data.people.find((p) => p.id === firstId)?.active)
  )
    throw new Error("فرد غیرفعال را نمی‌توان به شیفت جدید منتقل کرد.");
  if (
    firstDate !== secondDate &&
    (first.primary.includes(secondId) ||
      second.primary.includes(firstId) ||
      first.reserve.includes(secondId) ||
      second.reserve.includes(firstId))
  )
    throw new Error(
      "این جابه‌جایی باعث تداخل با نقش اصلی یا رزرو در روز مقصد می‌شود.",
    );
  const transfers =
    firstDate === secondDate
      ? [[secondId, firstDate, secondDate]]
      : [
          [firstId, secondDate, firstDate],
          [secondId, firstDate, secondDate],
        ];
  for (const [id, destination, source] of transfers) {
    if (
      data.shifts.some(
        (s) =>
          s.date !== source &&
          s.date !== destination &&
          workingIds(s).includes(id) &&
          Math.abs(dayDistance(s.date, destination)) <=
            data.settings.minRestDays,
      )
    )
      throw new Error(
        "این جابه‌جایی با حداقل فاصلهٔ استراحت تنظیم‌شده تداخل دارد.",
      );
  }
}
export function applySwap(
  data: AppData,
  input: Omit<Swap, "id" | "createdAt">,
): AppData {
  validateSwap(
    data,
    input.firstDate,
    input.firstId,
    input.secondDate,
    input.secondId,
  );
  return {
    ...data,
    shifts: data.shifts.map((s) => {
      if (s.date !== input.firstDate && s.date !== input.secondDate) return s;
      if (input.firstDate === input.secondDate)
        return {
          ...s,
          primary: s.primary.map((id) =>
            id === input.firstId ? input.secondId : id,
          ),
          reserve: s.reserve.map((id) =>
            id === input.secondId ? input.firstId : id,
          ),
        };
      return {
        ...s,
        primary: s.primary.map((id) =>
          s.date === input.firstDate && id === input.firstId
            ? input.secondId
            : s.date === input.secondDate && id === input.secondId
              ? input.firstId
              : id,
        ),
      };
    }),
    swaps: [
      {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      },
      ...data.swaps,
    ],
  };
}

export function recordAttendance(
  data: AppData,
  date: string,
  personId: string,
  status: AttendanceStatus,
  note: string,
  replacementId?: string,
): AppData {
  const shift = data.shifts.find((s) => s.date === date);
  if (!shift?.primary.includes(personId))
    throw new Error("فرد انتخاب‌شده در این روز شیفت ندارد.");
  if (
    replacementId &&
    (status === "present" || !shift.reserve.includes(replacementId))
  )
    throw new Error("جایگزین باید از فهرست رزرو همین روز انتخاب شود.");
  if (
    replacementId &&
    shift.attendance.some(
      (a) => a.personId !== personId && a.replacementId === replacementId,
    )
  )
    throw new Error("این نیروی رزرو قبلاً جایگزین شده است.");
  if (
    replacementId &&
    data.shifts.some(
      (s) =>
        s.date !== date &&
        workingIds(s).includes(replacementId) &&
        Math.abs(dayDistance(s.date, date)) <= data.settings.minRestDays,
    )
  )
    throw new Error(
      "نیروی رزرو انتخاب‌شده با حداقل فاصلهٔ استراحت تداخل دارد. رزرو دیگری انتخاب کنید.",
    );
  return {
    ...data,
    shifts: data.shifts.map((s) =>
      s.date === date
        ? {
            ...s,
            attendance: [
              ...s.attendance.filter((a) => a.personId !== personId),
              {
                personId,
                status,
                note: note.trim(),
                ...(replacementId ? { replacementId } : {}),
              },
            ],
          }
        : s,
    ),
  };
}
