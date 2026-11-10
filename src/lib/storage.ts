import type { AppData } from "../types";
import { generateSchedule } from "./scheduler";
import { solar, todayKey } from "./calendar";
import { validAppearance } from "./appearance";

export const STORAGE_KEY = "hamshift:data:v1";
export function initialData(): AppData {
  const names = [
    "سارا احمدی",
    "عسل رضایی",
    "محمد محمدی",
    "علی حسینی",
    "نگار کریمی",
    "رضا موسوی",
    "مریم مرادی",
    "امیر جعفری",
    "نازنین اکبری",
    "حسین کاظمی",
    "فاطمه رحیمی",
    "مهدی صادقی",
    "زهرا نوری",
    "آرمان شریفی",
    "الهام عباسی",
    "سعید اسماعیلی",
  ];
  const data: AppData = {
    version: 1,
    demo: true,
    people: names.map((name, i) => ({
      id: String(1001 + i),
      name,
      department: i % 3 === 0 ? "پشتیبانی" : i % 3 === 1 ? "عملیات" : "اداری",
      active: true,
      reserveOnly: false,
    })),
    shifts: [],
    swaps: [],
    events: [],
    settings: {
      primaryCount: 2,
      reserveCount: 2,
      minRestDays: 1,
      hijriOffset: 0,
    },
  };
  const j = solar(todayKey());
  return { ...data, shifts: generateSchedule(data, j.jy, j.jm).shifts };
}
export function saveData(data: AppData) {
  const json = JSON.stringify(data);
  if (typeof window !== "undefined" && window.desktop) {
    const result = window.desktop.writeData(json);
    if (!result.ok)
      throw new Error(result.error || "ذخیرهٔ فایل داده‌ها انجام نشد.");
  } else localStorage.setItem(STORAGE_KEY, json);
}
export function loadData(): { data: AppData; error?: string } {
  try {
    let raw: string | null;
    if (typeof window !== "undefined" && window.desktop) {
      const result = window.desktop.readData();
      if (!result.ok) throw new Error(result.error);
      raw = result.data || null;
    } else raw = localStorage.getItem(STORAGE_KEY);
    return { data: raw ? validateBackup(JSON.parse(raw)) : initialData() };
  } catch {
    return {
      data: initialData(),
      error:
        "داده‌های ذخیره‌شده قابل خواندن نیستند. برای جلوگیری از بازنویسی، ذخیره‌سازی متوقف شد. نسخهٔ پشتیبان معتبر بازیابی کنید.",
    };
  }
}
export function validateBackup(value: unknown): AppData {
  const fail = () => {
    throw new Error(
      "فایل پشتیبان معتبر هم‌شیفت نیست یا داده‌های آن ناسازگار است.",
    );
  };
  if (!value || typeof value !== "object") return fail();
  const d = value as AppData;
  if (d.appearance !== undefined && !validAppearance(d.appearance))
    return fail();
  if (
    d.version !== 1 ||
    typeof d.demo !== "boolean" ||
    !Array.isArray(d.people) ||
    !Array.isArray(d.shifts) ||
    !Array.isArray(d.swaps) ||
    !Array.isArray(d.events) ||
    !d.settings
  )
    return fail();
  const ids = new Set<string>();
  for (const p of d.people) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id.trim() ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      typeof p.department !== "string" ||
      typeof p.active !== "boolean" ||
      typeof p.reserveOnly !== "boolean"
    )
      return fail();
    ids.add(p.id);
  }
  const dateOK = (v: unknown): v is string =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !isNaN(Date.parse(`${v}T12:00:00Z`)) &&
    new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
  const dates = new Set<string>();
  for (const s of d.shifts) {
    if (
      !s ||
      !dateOK(s.date) ||
      dates.has(s.date) ||
      !Array.isArray(s.primary) ||
      !Array.isArray(s.reserve) ||
      !Array.isArray(s.attendance)
    )
      return fail();
    dates.add(s.date);
    const participants = [...s.primary, ...s.reserve];
    if (
      new Set(participants).size !== participants.length ||
      participants.some((id) => !ids.has(id))
    )
      return fail();
    const attendanceIds = new Set<string>(),
      replacementIds = new Set<string>();
    for (const a of s.attendance) {
      if (
        !a ||
        !s.primary.includes(a.personId) ||
        attendanceIds.has(a.personId) ||
        !["present", "excused", "unexcused"].includes(a.status) ||
        typeof a.note !== "string"
      )
        return fail();
      attendanceIds.add(a.personId);
      if (a.replacementId) {
        if (
          a.status === "present" ||
          !s.reserve.includes(a.replacementId) ||
          replacementIds.has(a.replacementId)
        )
          return fail();
        replacementIds.add(a.replacementId);
      }
    }
  }
  const settings = d.settings;
  if (
    !Number.isInteger(settings.primaryCount) ||
    settings.primaryCount < 1 ||
    settings.primaryCount > 20 ||
    !Number.isInteger(settings.reserveCount) ||
    settings.reserveCount < 0 ||
    settings.reserveCount > 20 ||
    !Number.isInteger(settings.minRestDays) ||
    settings.minRestDays < 0 ||
    settings.minRestDays > 14 ||
    !Number.isInteger(settings.hijriOffset) ||
    Math.abs(settings.hijriOffset) > 2
  )
    return fail();
  for (const e of d.events)
    if (
      !e ||
      !dateOK(e.date) ||
      typeof e.title !== "string" ||
      !e.title.trim() ||
      typeof e.holiday !== "boolean" ||
      (e.override !== undefined && typeof e.override !== "boolean")
    )
      return fail();
  if (d.schedulingWarnings !== undefined) {
    if (
      !d.schedulingWarnings ||
      typeof d.schedulingWarnings !== "object" ||
      Array.isArray(d.schedulingWarnings)
    )
      return fail();
    for (const [date, warnings] of Object.entries(d.schedulingWarnings))
      if (
        !dateOK(date) ||
        !Array.isArray(warnings) ||
        warnings.some((w) => typeof w !== "string")
      )
        return fail();
  }
  const swapIds = new Set<string>();
  if (d.reserveChanges !== undefined) {
    if (!Array.isArray(d.reserveChanges)) return fail();
    const changeIds = new Set<string>();
    for (const c of d.reserveChanges) {
      if (
        !c ||
        typeof c.id !== "string" ||
        !c.id ||
        changeIds.has(c.id) ||
        !dateOK(c.date) ||
        !dates.has(c.date) ||
        typeof c.createdAt !== "string" ||
        isNaN(Date.parse(c.createdAt)) ||
        typeof c.note !== "string" ||
        !["manual", "attendance"].includes(c.source) ||
        !Array.isArray(c.previousIds) ||
        !Array.isArray(c.nextIds) ||
        c.previousIds.length !== c.nextIds.length ||
        !c.nextIds.length
      )
        return fail();
      for (const roster of [c.previousIds, c.nextIds])
        if (
          new Set(roster).size !== roster.length ||
          roster.some((id) => !ids.has(id))
        )
          return fail();
      changeIds.add(c.id);
    }
  }
  for (const s of d.swaps) {
    if (
      !s ||
      typeof s.id !== "string" ||
      swapIds.has(s.id) ||
      !dateOK(s.firstDate) ||
      !dateOK(s.secondDate) ||
      !ids.has(s.firstId) ||
      !ids.has(s.secondId) ||
      s.firstId === s.secondId ||
      typeof s.note !== "string" ||
      typeof s.createdAt !== "string" ||
      isNaN(Date.parse(s.createdAt))
    )
      return fail();
    swapIds.add(s.id);
  }
  return d;
}
