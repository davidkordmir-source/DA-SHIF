import { describe, it, expect } from "vitest";
import type { AppData } from "../types";
import { generateSchedule, personStats } from "./scheduler";
import { dayOfWeek, monthDates, eventsFor } from "./calendar";
const fixture = (): AppData => ({
  version: 1,
  demo: false,
  people: Array.from({ length: 16 }, (_, i) => ({
    id: String(1001 + i),
    name: `همکار ${i + 1}`,
    department: "عملیات",
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
});
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
describe("fairness over recorded prior months", () => {
  it("balances each month while rotating holidays and Fridays across twelve consecutive months", () => {
    const data = fixture();
    for (let month = 1; month <= 12; month++) {
      data.shifts = generateSchedule(data, 1405, month).shifts;
      const days = new Set(monthDates(1405, month)),
        current = data.shifts.filter((s) => days.has(s.date));
      const st = data.people.map((p) => personStats(p.id, current, data));
      expect(
        spread(st.map((s) => s.total)),
        `Total spread in month ${month}`,
      ).toBeLessThanOrEqual(1);
      expect(
        spread(st.map((s) => s.holiday)),
        `Holiday spread in month ${month}`,
      ).toBeLessThanOrEqual(1);
      expect(
        spread(st.map((s) => s.friday)),
        `Friday spread in month ${month}`,
      ).toBeLessThanOrEqual(1);
    }
    const all = data.people.map((p) => personStats(p.id, data.shifts, data));
    expect(spread(all.map((s) => s.holiday))).toBeLessThanOrEqual(2);
    expect(spread(all.map((s) => s.friday))).toBeLessThanOrEqual(1);
  }, 15000);
  it("gives the next Fridays to people with fewer recorded Fridays instead of the same people", () => {
    const data = fixture();
    data.shifts = monthDates(1405, 7)
      .filter((d) => dayOfWeek(d) === 6)
      .map((date) => ({
        date,
        primary: ["1001", "1002"],
        reserve: ["1003", "1004"],
        attendance: [],
      }));
    const result = generateSchedule(data, 1405, 8);
    const days = new Set(monthDates(1405, 8));
    const fridays = result.shifts.filter(
      (s) => days.has(s.date) && dayOfWeek(s.date) === 6,
    );
    expect(fridays).toHaveLength(5);
    expect(
      fridays.some(
        (s) => s.primary.includes("1001") || s.primary.includes("1002"),
      ),
    ).toBe(false);
  });
  it("does not give all holidays to a newcomer in order to catch up with older staff", () => {
    const data = fixture();
    data.people[15].active = false;
    for (let month = 1; month <= 7; month++)
      data.shifts = generateSchedule(data, 1405, month).shifts;
    data.people[15].active = true;
    data.shifts = generateSchedule(data, 1405, 8).shifts;
    const days = monthDates(1405, 8),
      current = data.shifts.filter((s) => days.includes(s.date));
    const newcomer = personStats("1016", current, data);
    const holidaySlots =
      days.filter((d) => eventsFor(d, data.events, 0).holiday).length * 2;
    expect(newcomer.holiday).toBeLessThanOrEqual(Math.ceil(holidaySlots / 16));
    expect(newcomer.total).toBeLessThanOrEqual(
      Math.ceil((days.length * 2) / 16),
    );
  }, 15000);
  it("preserves future plans without counting them as earlier-month fairness history", () => {
    const data = fixture(),
      baseline = generateSchedule(data, 1405, 8).shifts;
    const future = {
      date: monthDates(1405, 10)[10],
      primary: ["1001", "1002"],
      reserve: ["1003", "1004"],
      attendance: [],
    };
    data.shifts = [future];
    const withFuture = generateSchedule(data, 1405, 8).shifts;
    expect(withFuture.filter((s) => s.date !== future.date)).toEqual(baseline);
    expect(withFuture.find((s) => s.date === future.date)).toEqual(future);
  });
});
