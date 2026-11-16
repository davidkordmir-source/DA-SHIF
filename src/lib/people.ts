import type { AppData, Person, PersonnelCategory } from "../types";

export const personnelCategories: Record<PersonnelCategory, string> = {
  "night-lead": "مسئول شب",
  companion: "همراه",
  reserve: "رزرو",
};

// Older backups had only a reserve flag. Keep their scheduling behavior intact.
export function personnelCategory(person: Person): PersonnelCategory {
  return person.category ?? (person.reserveOnly ? "reserve" : "companion");
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
