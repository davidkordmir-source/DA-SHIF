import type { AppData } from "../types";
import { generateSchedule } from "./scheduler";
import { solar, todayKey } from "./calendar";
import { normalizeAppearance, validAppearance } from "./appearance";

export const STORAGE_KEY = "hamshift:data:v1";
export const STORAGE_BACKUP_KEY = `${STORAGE_KEY}:backup`;
const MAX_BYTES = 10 * 1024 * 1024;

function emptyData(): AppData {
  return {
    version: 1,
    demo: false,
    people: [],
    shifts: [],
    swaps: [],
    events: [],
    settings: { primaryCount: 2, reserveCount: 2, minRestDays: 1, hijriOffset: 0 },
  };
}

export function storageErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "QuotaExceededError")
      return "فضای ذخیره‌سازی کافی نیست. فضای آزاد را بررسی و دوباره تلاش کنید؛ اطلاعات قبلی حذف نشده‌اند.";
    if (error.name === "SecurityError")
      return "دسترسی برنامه به ذخیره‌سازی بسته است. دسترسی را بررسی و دوباره تلاش کنید؛ نیازی به حذف اطلاعات نیست.";
    return error.message;
  }
  return "دسترسی به اطلاعات انجام نشد. دوباره تلاش کنید؛ فایل‌های داده را حذف نکنید.";
}

export function parseBackup(raw: string): AppData {
  let parsed: unknown;
  try {
    // Windows text editors and exported JSON files may add a UTF-8 BOM.
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("فایل اطلاعات ناقص است یا ساختار JSON آن قابل خواندن نیست.");
  }
  return validateBackup(parsed);
}
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
export function saveData(data: AppData, recovering = false): AppData {
  // Never write records that this version cannot read on the next startup.
  const validated = validateBackup(data);
  const json = JSON.stringify(validated);
  if (new Blob([json]).size > MAX_BYTES)
    throw new Error("حجم اطلاعات بیشتر از ۱۰ مگابایت است. اطلاعات قبلی حفظ شدند؛ برای ادامه به نسخهٔ پشتیبان و بررسی حجم داده‌ها نیاز است.");
  if (typeof window !== "undefined" && window.desktop) {
    const result = window.desktop.writeData(json, recovering);
    if (!result.ok)
      throw new Error(result.error || "ذخیرهٔ فایل داده‌ها انجام نشد.");
  } else {
    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous === json && !recovering) return validated;
    if (previous !== null) {
      let valid = false;
      try { parseBackup(previous); valid = true; } catch { /* Preserve separately below. */ }
      if (recovering || !valid)
        localStorage.setItem(`${STORAGE_KEY}:recovery:${crypto.randomUUID()}`, previous);
      else
        localStorage.setItem(STORAGE_BACKUP_KEY, previous);
    }
    if (recovering) {
      const oldBackup = localStorage.getItem(STORAGE_BACKUP_KEY);
      if (oldBackup !== json) {
        if (oldBackup !== null)
          localStorage.setItem(`${STORAGE_BACKUP_KEY}:recovery:${crypto.randomUUID()}`, oldBackup);
        localStorage.setItem(STORAGE_BACKUP_KEY, json);
      }
    } else if (previous === null && localStorage.getItem(STORAGE_BACKUP_KEY) === null) {
      localStorage.setItem(STORAGE_BACKUP_KEY, json);
    }
    localStorage.setItem(STORAGE_KEY, json);
  }
  return validated;
}

export type LoadedData = {
  data: AppData;
  source: "primary" | "backup" | "new" | "unavailable";
  needsSave?: boolean;
  error?: string;
  notice?: string;
};

export function loadData(): LoadedData {
  const desktop = typeof window !== "undefined" ? window.desktop : undefined;
  let primaryError = "";
  let primaryMissing = false;
  let primaryRead = false;
  try {
    let raw: string | null | undefined;
    if (desktop) {
      const result = desktop.readData();
      if (!result.ok) throw new Error(result.error);
      raw = result.data;
    } else raw = localStorage.getItem(STORAGE_KEY);
    primaryRead = true;
    primaryMissing = raw == null;
    if (!primaryMissing) {
      const data = parseBackup(raw!);
      const original = JSON.parse(raw!.replace(/^\uFEFF/, ""));
      const repaired = original.appearance !== undefined && !validAppearance(original.appearance);
      return {
        data,
        source: "primary",
        needsSave: repaired,
        notice: repaired ? "تنظیمات ظاهری ناسازگار اصلاح شدند؛ اطلاعات پرسنل و سوابق حفظ شدند." : undefined,
      };
    }
  } catch (error) {
    primaryError = storageErrorMessage(error);
  }

  // A locked or inaccessible file may contain newer, valid records. Retry
  // reading it instead of automatically rolling back to an older backup.
  if (!primaryRead) {
    return {
      data: emptyData(),
      source: "unavailable",
      error: `${primaryError} فایل‌ها را حذف نکنید؛ پس از رفع مشکل دسترسی، دوباره تلاش کنید.`,
    };
  }

  let backupError = "";
  try {
    let raw: string | null | undefined;
    if (desktop) {
      const result = desktop.readBackup?.();
      if (result && !result.ok) throw new Error(result.error);
      raw = result?.data;
    } else raw = localStorage.getItem(STORAGE_BACKUP_KEY);
    if (raw != null) {
      const data = parseBackup(raw);
      return {
        data,
        source: "backup",
        needsSave: true,
        notice: "فایل اصلی قابل استفاده نبود؛ آخرین پشتیبان خودکار معتبر بازیابی شد. ممکن است آخرین تغییرات در آن نباشد. فایل اصلی برای بررسی جداگانه حفظ می‌شود.",
      };
    }
  } catch (error) {
    backupError = storageErrorMessage(error);
  }

  if (primaryMissing && !backupError)
    return { data: initialData(), source: "new", needsSave: true };

  // Do not show or export demo records as though they were the user's data.
  return {
    data: emptyData(),
    source: "unavailable",
    error: `${primaryError || "فایل اصلی اطلاعات پیدا نشد."} ${backupError ? `پشتیبان خودکار نیز قابل استفاده نیست: ${backupError}` : "پشتیبان خودکار معتبری پیدا نشد."} فایل‌ها را حذف نکنید؛ دوباره تلاش کنید یا از تنظیمات پشتیبان معتبر بازیابی کنید.`,
  };
}
export function validateBackup(value: unknown): AppData {
  const fail = (detail = "ساختار اصلی اطلاعات معتبر نیست.") => {
    throw new Error(
      `اطلاعات هم‌شیفت ناسازگار است: ${detail}`,
    );
  };
  if (!value || typeof value !== "object") return fail();
  const d = value as AppData;
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
      return fail("اطلاعات پرسنل ناقص است یا کد پرسنلی تکراری دارد.");
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
      return fail("تاریخ یا ساختار یکی از شیفت‌ها معتبر نیست.");
    dates.add(s.date);
    const participants = [...s.primary, ...s.reserve];
    if (
      new Set(participants).size !== participants.length ||
      participants.some((id) => !ids.has(id))
    )
      return fail("شیفت دارای فرد ناشناس یا نقش تکراری است.");
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
        return fail("سابقهٔ حضور و غیاب با شیفت مربوط سازگار نیست.");
      attendanceIds.add(a.personId);
      if (a.replacementId) {
        if (
          a.status === "present" ||
          !s.reserve.includes(a.replacementId) ||
          replacementIds.has(a.replacementId)
        )
          return fail("نیروی جایگزین با رزروهای شیفت سازگار نیست.");
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
    return fail("قواعد برنامه‌ریزی خارج از محدودهٔ مجاز هستند.");
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
  return d.appearance === undefined
    ? d
    : { ...d, appearance: normalizeAppearance(d.appearance) };
}
