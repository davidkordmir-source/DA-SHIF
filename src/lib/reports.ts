import type { AppData } from "../types";
import { dayOfWeek, eventsFor } from "./calendar";
import { listShifts, scheduleLists } from "./schedules";

export const reportStatuses = {
  unrecorded: "حضور ثبت نشده",
  present: "حاضر",
  excused: "غیبت موجه",
  unexcused: "غیبت غیرموجه",
  replacement: "حضور جایگزین",
  reserve: "رزرو",
  off: "بدون شیفت",
} as const;
export type ReportStatus = keyof typeof reportStatuses;
export type ReportFilters = {
  start: string;
  end: string;
  department: string;
  personId: string;
  scheduleId: string;
  location: string;
  status: string;
  dayType: string;
  includeArchive: boolean;
};
export type ReportRow = {
  date: string;
  personId: string;
  name: string;
  department: string;
  schedule: string;
  location: string;
  role: "اصلی" | "رزرو" | "جایگزین" | "بدون شیفت";
  status: ReportStatus;
  holiday: boolean;
  note: string;
  archived: boolean;
};
export function reportRows(data: AppData, filter: ReportFilters): ReportRow[] {
  if (!filter.start || !filter.end || filter.end < filter.start) return [];
  const sources = scheduleLists(data).map((schedule) => ({
    schedule,
    data,
    shifts: listShifts(data, schedule),
    archived: false,
  }));
  if (filter.includeArchive)
    for (const archive of data.archives || []) {
      const snapshot: AppData = {
        version: 1,
        demo: false,
        ...archive.snapshot,
      };
      sources.push({
        schedule: archive.schedule,
        data: snapshot,
        shifts: snapshot.shifts.filter((s) =>
          archive.creditedDates.includes(s.date),
        ),
        archived: true,
      });
    }
  const rows: ReportRow[] = [];
  for (const source of sources) {
    const { schedule, shifts } = source;
    if (
      (filter.scheduleId && schedule.id !== filter.scheduleId) ||
      (filter.location && schedule.location !== filter.location)
    )
      continue;
    for (const shift of shifts) {
      if (shift.date < filter.start || shift.date > filter.end) continue;
      const holiday = eventsFor(
        shift.date,
        source.data.events,
        source.data.settings.hijriOffset,
      ).holiday;
      if (
        (filter.dayType === "holiday" && !holiday) ||
        (filter.dayType === "normal" && holiday) ||
        (filter.dayType === "friday" && dayOfWeek(shift.date) !== 6)
      )
        continue;
      const roster = new Set([
        ...schedule.personIds,
        ...shift.primary,
        ...shift.reserve,
      ]);
      for (const person of source.data.people.filter((p) => roster.has(p.id))) {
        if (
          (filter.department && person.department !== filter.department) ||
          (filter.personId && person.id !== filter.personId)
        )
          continue;
        const attendance = shift.attendance.find(
          (a) => a.personId === person.id,
        );
        const replaced = shift.attendance.find(
          (a) => a.replacementId === person.id,
        );
        let role: ReportRow["role"] = "بدون شیفت",
          status: ReportStatus = "off";
        if (shift.primary.includes(person.id)) {
          role = "اصلی";
          status = attendance?.status || "unrecorded";
        } else if (replaced) {
          role = "جایگزین";
          status = "replacement";
        } else if (shift.reserve.includes(person.id)) {
          role = "رزرو";
          status = "reserve";
        }
        if (filter.status ? status !== filter.status : status === "off")
          continue;
        rows.push({
          date: shift.date,
          personId: person.id,
          name: person.name,
          department: person.department,
          schedule: schedule.name,
          location: schedule.location || "",
          role,
          status,
          holiday,
          note: attendance?.note || replaced?.note || "",
          archived: source.archived,
        });
      }
    }
  }
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "fa"),
  );
}
