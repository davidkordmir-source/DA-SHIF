import type { AppData, Person, PersonRole, Shift } from "../types";
import { dayDistance, fa, solarLabel } from "./calendar";

export const roleLabels: Record<PersonRole, string> = {
  leader: "مسئول شب",
  companion: "همراه",
  reserve: "رزرو",
};
export const shiftKey = (shift: Shift) => shift.id || shift.date;
export const findShift = (data: Pick<AppData, "shifts">, key: string) =>
  data.shifts.find((s) => shiftKey(s) === key);
export const validTime = (time: unknown): time is string =>
  typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export function shiftTimeLabel(shift: Pick<Shift, "startTime" | "endTime">) {
  if (!shift.startTime || !shift.endTime) return "تمام روز";
  return `${fa(shift.startTime)} تا ${fa(shift.endTime)}${shift.endTime <= shift.startTime ? " روز بعد" : ""}`;
}
export const shiftLabel = (shift: Shift) =>
  `${solarLabel(shift.date)} · ${shiftTimeLabel(shift)}`;
export const listName = (
  data: Pick<AppData, "scheduleLists">,
  shift: Pick<Shift, "listId">,
) =>
  data.scheduleLists?.find((list) => list.id === shift.listId)?.name ||
  "فهرست قبلی";
export const namedShiftLabel = (data: AppData, shift: Shift) =>
  `${listName(data, shift)} · ${shiftLabel(shift)}`;
export const listNameKey = (name: string) =>
  name
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s‌]+/g, " ")
    .toLowerCase();
export function sharesExecution(
  data: Pick<AppData, "scheduleLists">,
  a: Pick<Shift, "listId">,
  b: Pick<Shift, "listId">,
) {
  if (a.listId === b.listId) return true;
  return !data.scheduleLists?.some(
    (list) =>
      list.mode === "alternative" &&
      (list.id === a.listId || list.id === b.listId),
  );
}
export const personRoleLabel = (p: Person) =>
  p.role
    ? roleLabels[p.role]
    : p.reserveOnly
      ? "رزرو"
      : "مسئول / همراه (مشترک)";
export const eligibleFor = (p: Person, role: PersonRole) =>
  p.role ? p.role === role : role === "reserve" || !p.reserveOnly;
export const primaryRole = (s: Shift, id: string) =>
  s.leaders?.includes(id) ? "مسئول شب" : s.leaders ? "همراه" : "نیروی اصلی";
export function shiftPeriod(s: Pick<Shift, "date" | "startTime" | "endTime">) {
  const start = Date.parse(`${s.date}T${s.startTime || "00:00"}:00Z`);
  let end = Date.parse(`${s.date}T${s.endTime || "00:00"}:00Z`);
  if (!s.startTime || !s.endTime || end <= start) end += 86400000;
  return { start, end };
}
export function periodsOverlap(
  a: Pick<Shift, "date" | "startTime" | "endTime">,
  b: Pick<Shift, "date" | "startTime" | "endTime">,
) {
  const ap = shiftPeriod(a),
    bp = shiftPeriod(b);
  return ap.start < bp.end && bp.start < ap.end;
}
export function restConflict(a: Shift, b: Shift, restDays: number) {
  return (
    periodsOverlap(a, b) ||
    (restDays > 0 && Math.abs(dayDistance(a.date, b.date)) <= restDays)
  );
}
export function reserveQueue(
  data: AppData,
  listId?: string,
  extraIds: string[] = [],
) {
  const pool = new Set([
    ...extraIds,
    ...(data.plans || [])
      .filter((plan) => plan.listId === listId)
      .flatMap((plan) => plan.peopleIds),
    ...data.shifts
      .filter((s) => s.listId === listId)
      .flatMap((s) => [...s.primary, ...s.reserve]),
  ]);
  const ids = data.people
    .filter(
      (p) =>
        p.active &&
        eligibleFor(p, "reserve") &&
        (!listId || !pool.size || pool.has(p.id)),
    )
    .map((p) => p.id);
  return [
    ...new Set([
      ...(
        (listId ? data.reserveQueues?.[listId] : data.reserveQueue) || []
      ).filter((id) => ids.includes(id)),
      ...ids,
    ]),
  ];
}
export function moveReserveToEnd(
  data: AppData,
  id: string,
  listId?: string,
): AppData {
  const queue = reserveQueue(data, listId, [id]);
  const next = [
    ...queue.filter((v) => v !== id),
    ...(queue.includes(id) ? [id] : []),
  ];
  return {
    ...data,
    ...(listId
      ? { reserveQueues: { ...data.reserveQueues, [listId]: next } }
      : { reserveQueue: next }),
  };
}
