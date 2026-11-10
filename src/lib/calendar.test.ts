import { describe, it, expect, vi, afterEach } from "vitest";
import {
  lunar,
  eventsFor,
  fromSolar,
  solar,
  dayOfWeek,
  todayKey,
  parseDate,
  dateKey,
} from "./calendar";
import {
  hasIranCalendar,
  CALENDAR_VALID_FROM,
  CALENDAR_VALID_UNTIL,
} from "./iran-calendar";
import table from "../data/iran-lunar.json";

afterEach(() => vi.useRealTimers());
describe("published Iranian calendar regression checks", () => {
  it("places Fatimiyah on Friday 22 Aban, not Saturday 23 Aban 1405", () => {
    const friday = "2026-11-13",
      saturday = "2026-11-14";
    expect(solar(friday)).toEqual({ jy: 1405, jm: 8, jd: 22 });
    expect(dayOfWeek(friday)).toBe(6);
    expect(lunar(friday)).toEqual({ year: 1448, month: 6, day: 3 });
    expect(
      eventsFor(friday).events.some(
        (e) => e.holiday && e.title.includes("فاطمه"),
      ),
    ).toBe(true);
    expect(
      eventsFor(saturday).events.some((e) => e.title.includes("فاطمه")),
    ).toBe(false);
    expect(eventsFor(saturday).holiday).toBe(false);
  });
  it.each([
    [1, 1, 1447, 10, 1],
    [1, 30, 1447, 11, 1],
    [2, 28, 1447, 12, 1],
    [3, 26, 1448, 1, 1],
    [4, 25, 1448, 2, 1],
    [5, 23, 1448, 3, 1],
    [6, 22, 1448, 4, 1],
    [7, 20, 1448, 5, 1],
    [8, 20, 1448, 6, 1],
    [9, 20, 1448, 7, 1],
    [10, 20, 1448, 8, 1],
    [11, 19, 1448, 9, 1],
    [12, 19, 1448, 10, 1],
  ])(
    "matches the annual-calendar month boundary at 1405/%s/%s",
    (m, d, hy, hm, hd) => {
      expect(lunar(fromSolar(1405, m, d))).toEqual({
        year: hy,
        month: hm,
        day: hd,
      });
    },
  );
  it.each([
    [1, 1, "فطر"],
    [1, 2, "فطر"],
    [1, 25, "صادق"],
    [3, 6, "قربان"],
    [3, 14, "غدیر"],
    [4, 3, "تاسوعا"],
    [4, 4, "عاشورا"],
    [5, 13, "اربعین"],
    [5, 21, "رسول"],
    [5, 22, "رضا"],
    [5, 30, "عسکری"],
    [6, 8, "رسول"],
    [8, 22, "فاطمه"],
    [10, 2, "علی"],
    [10, 16, "مبعث"],
    [11, 4, "قائم"],
    [12, 9, "علی"],
    [12, 19, "فطر"],
    [12, 20, "فطر"],
  ])("has the correct lunar holiday on 1405/%s/%s (%s)", (m, d, title) => {
    const day = eventsFor(fromSolar(1405, Number(m), Number(d)));
    expect(
      day.events.some(
        (e) =>
          e.source === "lunar" && e.holiday && e.title.includes(String(title)),
      ),
    ).toBe(true);
  });
  it("honors short Safar months and Gregorian occasions without making them holidays", () => {
    expect(lunar("2026-08-13")).toEqual({ year: 1448, month: 2, day: 29 });
    expect(
      eventsFor("2026-08-13").events.some(
        (e) => e.holiday && e.title.includes("رضا"),
      ),
    ).toBe(true);
    expect(
      eventsFor("2026-08-14").events.some((e) => e.title.includes("رضا")),
    ).toBe(false);
    expect(
      eventsFor("2026-11-10").events.some(
        (e) => e.source === "gregorian" && e.title.includes("علم"),
      ),
    ).toBe(true);
    expect(eventsFor("2026-11-10").holiday).toBe(false);
  });
  it("keeps every stored Iranian lunar month consecutive and 29 or 30 days long", () => {
    for (let i = 1; i < table.monthStarts.length; i++) {
      const previous = table.monthStarts[i - 1],
        current = table.monthStarts[i];
      const length =
        (parseDate(String(current[2])).getTime() -
          parseDate(String(previous[2])).getTime()) /
        86400000;
      expect([29, 30]).toContain(length);
      expect(
        Number(current[0]) * 12 +
          Number(current[1]) -
          Number(previous[0]) * 12 -
          Number(previous[1]),
      ).toBe(1);
      const last = dateKey(
        new Date(parseDate(String(current[2])).getTime() - 86400000),
      );
      expect(lunar(last).day).toBe(length);
      expect(lunar(String(current[2])).day).toBe(1);
    }
    expect(hasIranCalendar(CALENDAR_VALID_FROM)).toBe(true);
    expect(hasIranCalendar(CALENDAR_VALID_UNTIL)).toBe(true);
    expect(hasIranCalendar("2027-03-21")).toBe(false);
  });
  it("rolls the civil day over at Tehran midnight independently of the computer timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T20:29:59Z"));
    expect(todayKey()).toBe("2026-11-13");
    vi.setSystemTime(new Date("2026-11-13T20:30:00Z"));
    expect(todayKey()).toBe("2026-11-14");
  });
});
