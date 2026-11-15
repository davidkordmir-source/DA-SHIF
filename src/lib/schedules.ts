import type { AppData, ScheduleList, ShiftArchive, Shift } from "../types";
import {
  dateKey,
  dayDistance,
  months,
  parseDate,
  solar,
  todayKey,
} from "./calendar";

export function dateRange(start: string, end: string) {
  for (const date of [start, end]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      isNaN(parseDate(date).getTime()) ||
      dateKey(parseDate(date)) !== date
    )
      throw new Error("تاریخ بازه معتبر نیست.");
  }
  const length = dayDistance(end, start) + 1;
  if (!Number.isInteger(length) || length < 1 || length > 366)
    throw new Error(
      "بازهٔ برنامه باید بین ۱ تا ۳۶۶ روز باشد؛ پایان نباید قبل از شروع باشد.",
    );
  return Array.from({ length }, (_, i) =>
    dateKey(new Date(parseDate(start).getTime() + i * 86400000)),
  );
}

// Old backups have one roster per solar month. Give these stable IDs without
// rewriting their shifts, so reminders and deletion also work for existing data.
export function scheduleLists(data: AppData): ScheduleList[] {
  const legacy = new Map<string, string[]>();
  for (const shift of data.shifts.filter((s) => !s.scheduleId)) {
    const j = solar(shift.date),
      key = `${j.jy}-${j.jm}`;
    legacy.set(key, [...(legacy.get(key) || []), shift.date]);
  }
  return [
    ...(data.schedules || []),
    ...[...legacy].map(([key, dates]) => {
      dates.sort();
      const j = solar(dates[0]);
      return {
        id: `legacy:${key}`,
        name: `برنامهٔ ${months[j.jm - 1]} ${j.jy}`,
        startDate: dates[0],
        endDate: dates.at(-1)!,
        personIds: data.people.map((p) => p.id),
      };
    }),
  ].sort((a, b) => b.startDate.localeCompare(a.startDate));
}
export function listShifts(data: AppData, list: ScheduleList) {
  return data.shifts.filter((s) =>
    list.id.startsWith("legacy:")
      ? !s.scheduleId && s.date >= list.startDate && s.date <= list.endDate
      : s.scheduleId === list.id,
  );
}
export function creditedShifts(data: AppData) {
  return (data.archives || []).flatMap((a) =>
    a.snapshot.shifts.filter((s) => a.creditedDates.includes(s.date)),
  );
}
export function historyShifts(data: AppData) {
  return [...data.shifts, ...creditedShifts(data)];
}
// Reducing today's default must not revoke rest already recorded at deletion.
export function requiredRestDays(data: AppData, shift: Shift) {
  const recorded = (data.archives || []).find((a) =>
    a.creditedDates.includes(shift.date),
  );
  return Math.max(
    data.settings.minRestDays,
    recorded?.snapshot.settings.minRestDays || 0,
  );
}
export function archiveSchedule(
  data: AppData,
  id: string,
  input: {
    reason: string;
    recordedBy: string;
    rights: "preserve" | "mistake";
    restAcknowledged: boolean;
  },
  today = todayKey(),
): AppData {
  const schedule = scheduleLists(data).find((s) => s.id === id);
  if (!schedule) throw new Error("فهرست برنامه پیدا نشد.");
  if (
    !input.reason.trim() ||
    !input.recordedBy.trim() ||
    !input.restAcknowledged ||
    !["preserve", "mistake"].includes(input.rights)
  )
    throw new Error(
      "دلیل، نام ثبت‌کننده و وضعیت حق شیفت و استراحت را تکمیل کنید.",
    );
  const shifts = listShifts(data, schedule),
    dates = new Set(shifts.map((s) => s.date));
  const swaps = data.swaps.filter(
    (s) => dates.has(s.firstDate) || dates.has(s.secondDate),
  );
  const changes = (data.reserveChanges || []).filter((c) => dates.has(c.date));
  if (
    input.rights === "mistake" &&
    (shifts.some((s) => s.attendance.length) || swaps.length || changes.length)
  )
    throw new Error(
      "این برنامه سابقهٔ ثبت‌شده دارد؛ حذف به‌عنوان برنامهٔ بدون اجرا مجاز نیست. حفظ حق شیفت را انتخاب کنید.",
    );
  const archive: ShiftArchive = {
    id: crypto.randomUUID(),
    schedule,
    reason: input.reason.trim(),
    recordedBy: input.recordedBy.trim(),
    createdAt: new Date().toISOString(),
    rights: input.rights,
    restAcknowledged: true,
    creditedDates:
      input.rights === "preserve"
        ? shifts.filter((s) => s.date <= today).map((s) => s.date)
        : [],
    snapshot: {
      people: data.people,
      shifts,
      swaps,
      reserveChanges: changes,
      settings: data.settings,
      events: data.events,
    },
  };
  return {
    ...data,
    demo: false,
    shifts: data.shifts.filter((s) => !dates.has(s.date)),
    schedules: (data.schedules || []).filter((s) => s.id !== id),
    // A swap linking two lists still belongs to the surviving list's history.
    swaps: data.swaps.filter(
      (s) => !dates.has(s.firstDate) || !dates.has(s.secondDate),
    ),
    reserveChanges: (data.reserveChanges || []).filter(
      (c) => !dates.has(c.date),
    ),
    schedulingWarnings: Object.fromEntries(
      Object.entries(data.schedulingWarnings || {}).filter(
        ([d]) => !dates.has(d),
      ),
    ),
    archives: [...(data.archives || []), archive],
    reminder:
      data.reminder?.scheduleId === id
        ? { ...data.reminder, enabled: false, scheduleId: "" }
        : data.reminder,
  };
}
