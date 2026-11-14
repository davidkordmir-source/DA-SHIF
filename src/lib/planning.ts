import type {
  AppData,
  PersonRole,
  ScheduleList,
  SchedulePlan,
  Shift,
} from "../types";
import { dayDistance, dayOfWeek, eventsFor, solarInput } from "./calendar";
import { personStats, workingIds } from "./scheduler";
import {
  eligibleFor,
  findShift,
  listNameKey,
  sharesExecution,
  periodsOverlap,
  reserveQueue,
  restConflict,
  shiftKey,
  validTime,
} from "./shift-utils";

export type PlanningOptions = {
  title: string;
  listId?: string;
  listName?: string;
  listMode?: ScheduleList["mode"];
  startDate: string;
  endDate: string;
  leaderCount: number;
  companionCount: number;
  reserveCount: number;
  peopleIds: string[];
  times?: { startTime: string; endTime: string }[];
};
export function rangeDates(start: string, end: string) {
  const valid = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !isNaN(Date.parse(`${v}T00:00:00Z`)) &&
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  if (!valid(start) || !valid(end))
    throw new Error("تاریخ شروع و پایان معتبر وارد کنید.");
  const count = dayDistance(end, start) + 1;
  if (count < 1) throw new Error("تاریخ پایان نباید پیش از تاریخ شروع باشد.");
  if (count > 3660)
    throw new Error(
      "هر برنامه می‌تواند حداکثر ۳۶۶۰ روز داشته باشد؛ بازه را به چند برنامه تقسیم کنید.",
    );
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}

// Plans append new shifts. Existing duties and their attendance are never replaced.
export function generateRangeSchedule(
  data: AppData,
  options: PlanningOptions,
): AppData {
  const dates = rangeDates(options.startDate, options.endDate);
  const counts = [
    options.leaderCount,
    options.companionCount,
    options.reserveCount,
  ];
  if (
    counts.some((n) => !Number.isInteger(n) || n < 0 || n > 2000) ||
    counts[0] + counts[1] < 1
  )
    throw new Error(
      "ظرفیت مسئول و همراه باید در مجموع حداقل یک نفر و هر ظرفیت عددی بین صفر تا ۲۰۰۰ باشد.",
    );
  const times = options.times?.length ? options.times : [{}];
  if (times.length > 24)
    throw new Error("حداکثر ۲۴ نوبت در هر روز تعریف کنید.");
  for (const time of times) {
    if (
      "startTime" in time &&
      (!validTime(time.startTime) ||
        !validTime(time.endTime) ||
        time.startTime === time.endTime)
    )
      throw new Error("ساعت شروع و پایان هر نوبت را معتبر و متفاوت وارد کنید.");
  }
  const planId = crypto.randomUUID();
  const name = (options.listName || options.title || "فهرست اصلی").trim();
  if (!name || name.length > 100)
    throw new Error("نام فهرست را با حداکثر ۱۰۰ نویسه وارد کنید.");
  let list = options.listId
    ? data.scheduleLists?.find((item) => item.id === options.listId)
    : data.scheduleLists?.find(
        (item) => listNameKey(item.name) === listNameKey(name),
      );
  if (options.listId && !list) throw new Error("فهرست انتخاب‌شده پیدا نشد.");
  if (
    options.listMode &&
    !["parallel", "alternative"].includes(options.listMode)
  )
    throw new Error("نوع فهرست معتبر نیست.");
  if (
    list &&
    !options.listId &&
    options.listMode &&
    list.mode !== options.listMode
  )
    throw new Error(
      "این نام برای فهرست دیگری ثبت شده است؛ نام متفاوتی انتخاب کنید.",
    );
  if (!list)
    list = {
      id: crypto.randomUUID(),
      name,
      mode: options.listMode || "parallel",
    };
  const selectedList = list;
  const scheduleLists = data.scheduleLists?.some(
    (item) => item.id === selectedList.id,
  )
    ? data.scheduleLists
    : [...(data.scheduleLists || []), selectedList];
  const scopedData = { ...data, scheduleLists };
  const shifts: Shift[] = dates.flatMap((date) =>
    times.map((time) => ({
      id: crypto.randomUUID(),
      listId: selectedList.id,
      date,
      ...time,
      primary: [],
      leaders: [],
      reserve: [],
      attendance: [],
    })),
  );
  const byDate = new Map<string, Shift[]>();
  for (const s of data.shifts.filter((s) => s.listId === selectedList.id)) {
    for (const date of [
      s.date,
      new Date(Date.parse(`${s.date}T00:00:00Z`) + 86400000)
        .toISOString()
        .slice(0, 10),
    ])
      byDate.set(date, [...(byDate.get(date) || []), s]);
  }
  for (const s of shifts) {
    const previousDate = new Date(Date.parse(`${s.date}T00:00:00Z`) - 86400000)
      .toISOString()
      .slice(0, 10);
    const nextDate = new Date(Date.parse(`${s.date}T00:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10);
    const candidates = [
      ...(byDate.get(s.date) || []),
      ...(byDate.get(previousDate) || []),
      ...(byDate.get(nextDate) || []),
    ];
    if (candidates.some((other) => periodsOverlap(s, other)))
      throw new Error(
        `در فهرست «${selectedList.name}»، ${solarInput(s.date)} برنامه‌ای در این ساعت وجود دارد. سوابق حفظ شده‌اند؛ آن را ویرایش یا فهرست دیگری انتخاب کنید.`,
      );
    byDate.set(s.date, [...(byDate.get(s.date) || []), s]);
  }
  // Adjacent overnight slots also need to be checked against the following day.
  const chronological = [...shifts].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime || "").localeCompare(b.startTime || ""),
  );
  for (let i = 1; i < chronological.length; i++)
    if (periodsOverlap(chronological[i - 1], chronological[i]))
      throw new Error("نوبت‌های ساعتی با یکدیگر هم‌پوشانی دارند.");
  const active = data.people.filter(
    (p) => p.active && options.peopleIds.includes(p.id),
  );
  const roles: PersonRole[] = ["leader", "companion", "reserve"];
  const listIndex = scheduleLists.findIndex(
    (item) => item.id === selectedList.id,
  );
  const roleRanks = roles.map((role) => {
    const pool = active.filter((p) => eligibleFor(p, role));
    return new Map(
      pool.map((p, index) => [
        p.id,
        (index - (listIndex % pool.length) + pool.length) % pool.length,
      ]),
    );
  });
  const mixedLegacyPools =
    active.some((p) => !p.role && !p.reserveOnly) &&
    active.some((p) => p.role && p.role !== "reserve");
  roles.forEach((role, i) => {
    if (active.filter((p) => eligibleFor(p, role)).length < counts[i])
      throw new Error(
        `تعداد افراد انتخاب‌شده در فهرست ${role === "leader" ? "مسئول شب" : role === "companion" ? "همراه" : "رزرو"} از ظرفیت هر نوبت کمتر است.`,
      );
  });
  if (active.length < counts.reduce((a, b) => a + b, 0))
    throw new Error(
      "برای نقش‌های هم‌زمان افراد کافی انتخاب نشده‌اند؛ هر نفر در هر نوبت فقط یک نقش دارد.",
    );
  const relevant = data.shifts.filter((s) =>
    sharesExecution(scopedData, shifts[0], s),
  );
  const history = relevant.filter((s) => s.date < dates[0]);
  const occupied = new Map(
    active.map((p) => [
      p.id,
      relevant.filter((s) => [...s.primary, ...s.reserve].includes(p.id)),
    ]),
  );
  const duties = new Map(
    active.map((p) => [
      p.id,
      relevant.filter((s) => workingIds(s).includes(p.id)),
    ]),
  );
  const stats = new Map(
    active.map((p) => {
      const s = personStats(p.id, history, data);
      return [
        p.id,
        {
          total: 0,
          holiday: 0,
          friday: 0,
          weekdays: Array(7).fill(0) as number[],
          pastTotal: s.workload,
          pastHoliday: s.workloadHoliday,
          pastFriday: s.workloadFriday,
          reserve: s.reserve,
        },
      ];
    }),
  );
  const info = new Map(
    dates.map((date) => [
      date,
      eventsFor(date, data.events, data.settings.hijriOffset),
    ]),
  );
  const warnings: string[] = [];
  const ordered = [...shifts].sort(
    (a, b) =>
      Number(info.get(b.date)!.holiday) - Number(info.get(a.date)!.holiday) ||
      a.date.localeCompare(b.date) ||
      (a.startTime || "").localeCompare(b.startTime || ""),
  );
  for (const shift of ordered) {
    const event = info.get(shift.date)!,
      day = dayOfWeek(shift.date);
    const available = active.filter(
      (p) => !occupied.get(p.id)!.some((s) => periodsOverlap(s, shift)),
    );
    for (const [roleIndex, role] of roles.slice(0, 2).entries()) {
      for (let slot = 0; slot < counts[roleIndex]; slot++) {
        let pool = available.filter(
          (p) =>
            eligibleFor(p, role) &&
            !shift.primary.includes(p.id) &&
            !duties.get(p.id)!.some((s) => periodsOverlap(s, shift)),
        );
        if (mixedLegacyPools) {
          // A legacy person can fill several categories. Keep enough eligible
          // people for the remaining categories instead of consuming the only
          // available companion as a leader (or the only reserve as primary).
          const remaining = counts.map((n, i) =>
            i < roleIndex ? 0 : i === roleIndex ? n - slot - 1 : n,
          );
          const remainingPeople = available.filter(
            (p) => !shift.primary.includes(p.id),
          );
          pool = pool.filter((chosen) => {
            for (let mask = 1; mask < 8; mask++) {
              const demand = remaining.reduce(
                (sum, n, i) => sum + (mask & (1 << i) ? n : 0),
                0,
              );
              const supply = remainingPeople.filter(
                (p) =>
                  p.id !== chosen.id &&
                  roles.some((r, i) => mask & (1 << i) && eligibleFor(p, r)),
              ).length;
              if (supply < demand) return false;
            }
            return true;
          });
        }
        if (!pool.length)
          throw new Error(
            "برای این نوبت، افراد بدون تداخل با فهرست‌های اجرایی دیگر کافی نیستند. افراد بیشتری انتخاب کنید یا برای مقایسهٔ چیدمان‌ها، فهرست پیشنهادی بسازید.",
          );
        const conflicts = new Map(
          pool.map((p) => [
            p.id,
            duties
              .get(p.id)!
              .filter((s) => restConflict(s, shift, data.settings.minRestDays))
              .length,
          ]),
        );
        const score = (id: string) => {
          const st = stats.get(id)!;
          return event.holiday
            ? [
                conflicts.get(id)!,
                st.holiday,
                event.friday ? st.friday : 0,
                event.friday ? st.pastFriday : 0,
                st.pastHoliday,
                st.weekdays[day],
                st.total,
                st.pastTotal,
              ]
            : [conflicts.get(id)!, st.total, st.weekdays[day], st.pastTotal];
        };
        pool.sort((a, b) => {
          const left = score(a.id),
            right = score(b.id);
          for (let i = 0; i < left.length; i++)
            if (left[i] !== right[i]) return left[i] - right[i];
          return selectedList.mode === "alternative"
            ? roleRanks[roleIndex].get(a.id)! - roleRanks[roleIndex].get(b.id)!
            : a.id.localeCompare(b.id);
        });
        const chosen = pool[0];
        if (conflicts.get(chosen.id))
          warnings.push(
            `${shift.date}: فاصلهٔ استراحت برای ${chosen.name} قابل رعایت نبود.`,
          );
        shift.primary.push(chosen.id);
        if (role === "leader") shift.leaders!.push(chosen.id);
        duties.get(chosen.id)!.push(shift);
        const st = stats.get(chosen.id)!;
        st.total++;
        st.weekdays[day]++;
        if (event.holiday) st.holiday++;
        if (event.friday) st.friday++;
      }
    }
  }
  const queue = reserveQueue(scopedData, selectedList.id, options.peopleIds);
  if (
    selectedList.mode === "alternative" &&
    !data.reserveQueues?.[selectedList.id] &&
    queue.length
  )
    queue.push(...queue.splice(0, listIndex % queue.length));
  for (const shift of chronological) {
    const pool = active.filter(
      (p) =>
        eligibleFor(p, "reserve") &&
        !shift.primary.includes(p.id) &&
        !occupied.get(p.id)!.some((s) => periodsOverlap(s, shift)),
    );
    pool.sort((a, b) => {
      const score = (id: string) =>
        duties
          .get(id)!
          .filter((s) => restConflict(s, shift, data.settings.minRestDays))
          .length;
      return (
        score(a.id) - score(b.id) || queue.indexOf(a.id) - queue.indexOf(b.id)
      );
    });
    if (pool.length < options.reserveCount)
      throw new Error(
        "برای رزروهای متمایز از مسئول و همراه افراد کافی وجود ندارد.",
      );
    for (const p of pool.slice(0, options.reserveCount)) {
      shift.reserve.push(p.id);
      queue.splice(queue.indexOf(p.id), 1);
      queue.push(p.id);
    }
  }
  const plan: SchedulePlan = {
    id: planId,
    listId: selectedList.id,
    title:
      options.title.trim().slice(0, 150) ||
      `برنامهٔ ${solarInput(dates[0])} تا ${solarInput(dates.at(-1)!)}`,
    createdAt: new Date().toISOString(),
    startDate: dates[0],
    endDate: dates.at(-1)!,
    shiftIds: shifts.map(shiftKey),
    peopleIds: active.map((p) => p.id),
  };
  return {
    ...data,
    scheduleLists,
    demo: false,
    shifts: [...data.shifts, ...shifts].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime || "").localeCompare(b.startTime || ""),
    ),
    plans: [plan, ...(data.plans || [])],
    reserveQueues: { ...data.reserveQueues, [selectedList.id]: queue },
    schedulingWarnings: { ...data.schedulingWarnings, [plan.id]: warnings },
  };
}

export function editShift(
  data: AppData,
  key: string,
  roster: Pick<Shift, "primary" | "leaders" | "reserve">,
  note: string,
  overrideRest = false,
): AppData {
  const current = findShift(data, key);
  if (!current) throw new Error("شیفت موردنظر پیدا نشد.");
  const ids = [...roster.primary, ...roster.reserve];
  if (
    !roster.primary.length ||
    ids.some((id) => !id) ||
    new Set(ids).size !== ids.length
  )
    throw new Error(
      "حداقل یک مسئول یا همراه انتخاب کنید؛ افراد هر نوبت باید متفاوت باشند.",
    );
  if (
    (roster.leaders || []).some((id) => !roster.primary.includes(id)) ||
    new Set(roster.leaders || []).size !== (roster.leaders || []).length
  )
    throw new Error("فهرست مسئول شب معتبر نیست.");
  for (const id of ids) {
    const person = data.people.find((p) => p.id === id);
    if (
      !person ||
      (!person.active && ![...current.primary, ...current.reserve].includes(id))
    )
      throw new Error("برای انتصاب جدید فقط از افراد فعال انتخاب کنید.");
  }
  for (const a of current.attendance) {
    if (
      !roster.primary.includes(a.personId) ||
      (a.replacementId && !roster.reserve.includes(a.replacementId)) ||
      (current.leaders?.includes(a.personId) || false) !==
        (roster.leaders?.includes(a.personId) || false)
    )
      throw new Error(
        "فرد یا نقش دارای حضور و غیاب ثبت‌شده را نمی‌توان حذف کرد؛ سوابق باید حفظ شوند.",
      );
  }
  const next: Shift = { ...current, ...roster };
  const added = [
    ...roster.primary.filter((id) => !current.primary.includes(id)),
    ...roster.reserve.filter((id) => !current.reserve.includes(id)),
  ];
  const conflict = added.some((id) =>
    data.shifts.some(
      (s) =>
        shiftKey(s) !== key &&
        sharesExecution(data, next, s) &&
        (s.listId !== next.listId
          ? (roster.primary.includes(id) &&
              workingIds(s).includes(id) &&
              restConflict(s, next, data.settings.minRestDays)) ||
            ([...s.primary, ...s.reserve].includes(id) &&
              periodsOverlap(s, next))
          : roster.primary.includes(id) &&
            workingIds(s).includes(id) &&
            restConflict(s, next, data.settings.minRestDays)),
    ),
  );
  if (conflict && !overrideRest)
    throw new Error(
      "این انتخاب با استراحت یا شیفت دیگر تداخل دارد. برای اعمال آگاهانه، تأیید تغییر دستی و توضیح را وارد کنید.",
    );
  if (conflict && !note.trim())
    throw new Error("برای تغییر دارای تداخل، توضیح الزامی است.");
  if (JSON.stringify(current) === JSON.stringify(next)) return data;
  return {
    ...data,
    shifts: data.shifts.map((s) => (shiftKey(s) === key ? next : s)),
    shiftChanges: [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        shiftId: key,
        date: current.date,
        previous: structuredClone(current),
        next: structuredClone(next),
        note: note.trim().slice(0, 500),
        restOverride: conflict && overrideRest,
      },
      ...(data.shiftChanges || []),
    ],
  };
}

export function renameScheduleList(
  data: AppData,
  id: string,
  name: string,
): AppData {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100)
    throw new Error("نام فهرست باید بین ۱ تا ۱۰۰ نویسه باشد.");
  if (!data.scheduleLists?.some((list) => list.id === id))
    throw new Error("فهرست پیدا نشد.");
  if (
    data.scheduleLists.some(
      (list) =>
        list.id !== id && listNameKey(list.name) === listNameKey(trimmed),
    )
  )
    throw new Error("نام فهرست تکراری است.");
  return {
    ...data,
    scheduleLists: data.scheduleLists.map((list) =>
      list.id === id ? { ...list, name: trimmed } : list,
    ),
  };
}
