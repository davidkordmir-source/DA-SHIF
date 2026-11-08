import jalaali from "jalaali-js";
import type { CustomEvent } from "../types";

export const fa = (value: number | string) =>
  String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
export const latin = (value: string) =>
  value.replace(/[۰-۹٠-٩]/g, (d) =>
    String(
      "۰۱۲۳۴۵۶۷۸۹".includes(d)
        ? "۰۱۲۳۴۵۶۷۸۹".indexOf(d)
        : "٠١٢٣٤٥٦٧٨٩".indexOf(d),
    ),
  );
export const months = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
export const weekdays = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
];
export const hijriMonths = [
  "محرم",
  "صفر",
  "ربیع‌الاول",
  "ربیع‌الثانی",
  "جمادی‌الاول",
  "جمادی‌الثانی",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذی‌القعده",
  "ذی‌الحجه",
];
export const parseDate = (date: string) => new Date(`${date}T12:00:00Z`);
export const dateKey = (date: Date) => date.toISOString().slice(0, 10);
export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function solar(date: string) {
  const d = parseDate(date);
  return jalaali.toJalaali(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
  );
}
export function fromSolar(year: number, month: number, day: number) {
  if (!jalaali.isValidJalaaliDate(year, month, day))
    throw new Error("تاریخ شمسی معتبر نیست.");
  const d = jalaali.toGregorian(year, month, day);
  return `${d.gy}-${String(d.gm).padStart(2, "0")}-${String(d.gd).padStart(2, "0")}`;
}
export function monthDates(year: number, month: number) {
  return Array.from(
    { length: jalaali.jalaaliMonthLength(year, month) },
    (_, i) => fromSolar(year, month, i + 1),
  );
}
export const dayOfWeek = (date: string) =>
  (parseDate(date).getUTCDay() + 1) % 7;
export const dayDistance = (a: string, b: string) =>
  Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
export function solarLabel(date: string, full = false) {
  const d = solar(date);
  return `${full ? `${weekdays[dayOfWeek(date)]}، ` : ""}${fa(d.jd)} ${months[d.jm - 1]} ${fa(d.jy)}`;
}
export function solarInput(date: string) {
  const d = solar(date);
  return `${d.jy}/${String(d.jm).padStart(2, "0")}/${String(d.jd).padStart(2, "0")}`;
}
export function parseSolarInput(value: string) {
  const parts = latin(value).split(/[\/-]/).map(Number);
  if (parts.length !== 3)
    throw new Error("تاریخ را مانند ۱۴۰۵/۰۸/۱۷ وارد کنید.");
  return fromSolar(parts[0], parts[1], parts[2]);
}
export function lunar(date: string, offset = 0) {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + offset);
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-civil", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).formatToParts(d);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}
export function lunarLabel(date: string, offset = 0) {
  const d = lunar(date, offset);
  return `${fa(d.day)} ${hijriMonths[d.month - 1]} ${fa(d.year)}`;
}
export function gregorianLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(date));
}

type RecurringEvent = [number, number, string, boolean];
const solarEvents: RecurringEvent[] = [
  [1, 1, "آغاز نوروز", true],
  [1, 2, "عید نوروز", true],
  [1, 3, "عید نوروز", true],
  [1, 4, "عید نوروز", true],
  [1, 12, "روز جمهوری اسلامی", true],
  [1, 13, "روز طبیعت", true],
  [2, 1, "روز بزرگداشت سعدی", false],
  [2, 12, "روز معلم", false],
  [3, 14, "رحلت امام خمینی", true],
  [3, 15, "قیام ۱۵ خرداد", true],
  [4, 1, "روز اصناف", false],
  [6, 1, "روز پزشک", false],
  [6, 4, "روز کارمند", false],
  [7, 1, "آغاز سال تحصیلی", false],
  [7, 20, "روز بزرگداشت حافظ", false],
  [8, 13, "روز دانش‌آموز", false],
  [8, 24, "روز کتاب و کتاب‌خوانی", false],
  [9, 16, "روز دانشجو", false],
  [9, 30, "شب یلدا", false],
  [10, 5, "روز ایمنی در برابر زلزله", false],
  [11, 22, "پیروزی انقلاب اسلامی", true],
  [12, 5, "روز مهندس", false],
  [12, 15, "روز درختکاری", false],
  [12, 29, "ملی شدن صنعت نفت", true],
];
const lunarEvents: RecurringEvent[] = [
  [1, 9, "تاسوعای حسینی", true],
  [1, 10, "عاشورای حسینی", true],
  [2, 20, "اربعین حسینی", true],
  [2, 28, "رحلت پیامبر و شهادت امام حسن", true],
  [2, 30, "شهادت امام رضا", true],
  [3, 8, "شهادت امام حسن عسکری", true],
  [3, 17, "میلاد پیامبر و امام جعفر صادق", true],
  [6, 3, "شهادت حضرت فاطمه", true],
  [7, 13, "ولادت امام علی و روز پدر", true],
  [7, 27, "مبعث پیامبر", true],
  [8, 15, "ولادت حضرت مهدی", true],
  [9, 21, "شهادت امام علی", true],
  [10, 1, "عید فطر", true],
  [10, 2, "تعطیل عید فطر", true],
  [10, 25, "شهادت امام جعفر صادق", true],
  [12, 10, "عید قربان", true],
  [12, 18, "عید غدیر خم", true],
  [6, 20, "ولادت حضرت فاطمه و روز مادر", false],
];
export function eventsFor(
  date: string,
  custom: CustomEvent[] = [],
  offset = 0,
) {
  const j = solar(date),
    h = lunar(date, offset);
  const lastSafar =
    h.month === 2 &&
    h.day === 29 &&
    lunar(dateKey(new Date(parseDate(date).getTime() + 86400000)), offset)
      .month === 3;
  const events = [
    ...solarEvents
      .filter((e) => e[0] === j.jm && e[1] === j.jd)
      .map((e) => ({ title: e[2], holiday: e[3], source: "solar" })),
    ...lunarEvents
      .filter(
        (e) =>
          e[0] === h.month &&
          (e[1] === h.day || (e[0] === 2 && e[1] === 30 && lastSafar)),
      )
      .map((e) => ({ title: e[2], holiday: e[3], source: "lunar" })),
    ...custom
      .filter((e) => e.date === date)
      .map((e) => ({ title: e.title, holiday: e.holiday, source: "custom" })),
  ];
  const override = custom.filter((e) => e.date === date && e.override).at(-1);
  return {
    events,
    holiday: override
      ? override.holiday
      : dayOfWeek(date) === 6 || events.some((e) => e.holiday),
    friday: dayOfWeek(date) === 6,
  };
}
