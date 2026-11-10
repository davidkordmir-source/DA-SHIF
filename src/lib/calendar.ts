import jalaali from "jalaali-js";
import type { CustomEvent } from "../types";
import { iranLunar, IRAN_EVENTS } from "./iran-calendar";

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
  const published = iranLunar(date);
  if (published) return published;
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

export function eventsFor(
  date: string,
  custom: CustomEvent[] = [],
  offset = 0,
) {
  const j = solar(date),
    h = lunar(date, offset);
  const g = {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
  const add = (days: number) =>
    dateKey(new Date(parseDate(date).getTime() + days * 86400000));
  const tuple = (calendar: string, key: string = date) => {
    if (calendar === "Hijri") return key === date ? h : lunar(key, offset);
    if (calendar === "Gregorian")
      return key === date
        ? g
        : {
            year: Number(key.slice(0, 4)),
            month: Number(key.slice(5, 7)),
            day: Number(key.slice(8, 10)),
          };
    const p = key === date ? j : solar(key);
    return { year: p.jy, month: p.jm, day: p.jd };
  };
  const events = IRAN_EVENTS.filter((event) => {
    if ("fromYear" in event && event.fromYear && j.jy < event.fromYear)
      return false;
    const t = tuple(event.calendar);
    if (event.rule === "simple")
      return t.month === event.month && t.day === event.day;
    if (event.rule === "single event")
      return (
        t.year === event.year && t.month === event.month && t.day === event.day
      );
    if (event.rule === "end of month")
      return (
        t.month === event.month &&
        tuple(event.calendar, add(1)).month !== t.month
      );
    if (event.rule === "nth weekday of month")
      return (
        t.month === event.month &&
        dayOfWeek(date) === event.weekday &&
        Math.ceil(t.day / 7) === event.nth
      );
    if (event.rule === "last weekday of month") {
      const reference = add(-(event.offset || 0));
      const r = tuple(event.calendar, reference);
      return (
        r.month === event.month &&
        dayOfWeek(reference) === event.weekday &&
        tuple(
          event.calendar,
          dateKey(new Date(parseDate(reference).getTime() + 7 * 86400000)),
        ).month !== r.month
      );
    }
    return false;
  }).map((event) => ({
    title: event.title,
    holiday: event.holiday,
    source:
      event.calendar === "Hijri"
        ? "lunar"
        : event.calendar === "Gregorian"
          ? "gregorian"
          : "solar",
  }));
  events.sort((a, b) => Number(b.holiday) - Number(a.holiday));
  events.push(
    ...custom
      .filter((event) => event.date === date)
      .map((event) => ({
        title: event.title,
        holiday: event.holiday,
        source: "custom",
      })),
  );
  const override = custom.filter((e) => e.date === date && e.override).at(-1);
  return {
    events,
    holiday: override
      ? override.holiday
      : dayOfWeek(date) === 6 || events.some((e) => e.holiday),
    friday: dayOfWeek(date) === 6,
  };
}
