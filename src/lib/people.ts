import type {
  AppData,
  Person,
  PersonnelCategory,
  ScheduleRosters,
  Shift,
} from "../types";
import { latin } from "./calendar";

export const personnelCategories: Record<PersonnelCategory, string> = {
  "night-lead": "مسئول شب",
  companion: "همراه",
  reserve: "رزرو",
};

// Older backups had only a reserve flag. Keep their scheduling behavior intact.
export function personnelCategory(person: Person): PersonnelCategory {
  return person.category ?? (person.reserveOnly ? "reserve" : "companion");
}

export function personnelRoster(
  people: Person[],
  category: PersonnelCategory,
): Person[] {
  return people
    .filter((p) => personnelCategory(p) === category)
    .map((person, index) => ({ person, index }))
    .sort(
      (a, b) =>
        (a.person.rosterOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.person.rosterOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.index - b.index,
    )
    .map(({ person }) => person);
}

// Reimporting an existing list must use the NEW spreadsheet row order, not the
// old positions in data.people. Members absent from the file stay at the end.
export function mergeImportedPeople(
  existing: Person[],
  imported: Person[],
): Person[] {
  const people = [...existing];
  const importedIds: string[] = [];
  for (const person of imported) {
    let index = people.findIndex((p) => p.id === person.id);
    if (index < 0 && person.id.startsWith("name:")) {
      const normalize = (name: string) =>
        latin(name)
          .replace(/ي/g, "ی")
          .replace(/ك/g, "ک")
          .replace(/‌/g, " ")
          .trim()
          .toLowerCase();
      const matches = people
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => normalize(p.name) === normalize(person.name));
      if (matches.length > 1)
        throw new Error(
          `برای نام همسان «${person.name}» کد پرسنلی یکتا وارد کنید.`,
        );
      if (matches.length === 1) index = matches[0].i;
    }
    const id = index < 0 ? person.id : people[index].id;
    if (importedIds.includes(id))
      throw new Error(
        "دو ردیف اکسل به یک پرسنل اشاره می‌کنند؛ کدهای پرسنلی یکتا وارد کنید.",
      );
    importedIds.push(id);
    if (index < 0) people.push({ ...person, id });
    else people[index] = { ...person, id };
  }
  const orders = new Map<string, number>();
  for (const category of Object.keys(
    personnelCategories,
  ) as PersonnelCategory[]) {
    const roster = personnelRoster(people, category);
    const first = importedIds.filter((id) => roster.some((p) => p.id === id));
    [
      ...first,
      ...roster.filter((p) => !importedIds.includes(p.id)).map((p) => p.id),
    ].forEach((id, index) => orders.set(id, index));
  }
  return people.map((p) => ({ ...p, rosterOrder: orders.get(p.id)! }));
}

export function primaryRoleLabel(shift: Shift, id: string): string {
  const role = shift.primaryRoles?.[shift.primary.indexOf(id)];
  return role ? personnelCategories[role] : "نیروی اصلی";
}

export function validScheduleRosters(
  value: unknown,
  memberIds: string[],
): value is ScheduleRosters {
  if (!value || typeof value !== "object") return false;
  const r = value as ScheduleRosters;
  if (
    ![r.nightLeadIds, r.companionIds, r.reserveIds].every(Array.isArray) ||
    !r.nightLeadIds.length ||
    !Number.isInteger(r.reserveCount) ||
    r.reserveCount < 0 ||
    r.reserveCount > 20 ||
    r.reserveCount > r.reserveIds.length
  )
    return false;
  const ids = [...r.nightLeadIds, ...r.companionIds, ...r.reserveIds];
  return (
    new Set(ids).size === ids.length &&
    ids.length === memberIds.length &&
    ids.every((id) => typeof id === "string" && memberIds.includes(id))
  );
}

export function personDeletionBlocker(
  data: AppData,
  id: string,
): string | undefined {
  const referenced = (
    records: Pick<AppData, "shifts" | "swaps" | "reserveChanges">,
  ) =>
    records.shifts.some(
      (s) =>
        s.primary.includes(id) ||
        s.reserve.includes(id) ||
        s.attendance.some((a) => a.personId === id || a.replacementId === id),
    ) ||
    records.swaps.some((s) => s.firstId === id || s.secondId === id) ||
    records.reserveChanges?.some(
      (c) => c.previousIds.includes(id) || c.nextIds.includes(id),
    );
  if (
    referenced(data) ||
    data.schedules?.some((s) => s.personIds.includes(id)) ||
    data.archives?.some(
      (a) => referenced(a.snapshot) || a.schedule.personIds.includes(id),
    )
  ) {
    return "این فرد در برنامه‌ها یا سوابق ثبت‌شده حضور دارد. برای حفظ حق شیفت و گزارش‌ها، ابتدا برنامهٔ اشتباهِ بدون اجرا را از فهرست برنامه‌ها حذف کنید؛ برای فرد دارای سابقه از غیرفعال کردن استفاده کنید.";
  }
}

export function deletePerson(
  data: AppData,
  id: string,
  confirmation: string,
): AppData {
  const person = data.people.find((p) => p.id === id);
  if (!person) throw new Error("پرسنل پیدا نشد.");
  if (confirmation.trim() !== person.name)
    throw new Error("برای تأیید حذف، نام کامل فرد را دقیق وارد کنید.");
  const blocker = personDeletionBlocker(data, id);
  if (blocker) throw new Error(blocker);
  return { ...data, people: data.people.filter((p) => p.id !== id) };
}
