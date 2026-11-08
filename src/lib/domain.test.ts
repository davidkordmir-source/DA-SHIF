import { describe, expect, it } from "vitest";
import type { AppData } from "../types";
import {
  dayDistance,
  dayOfWeek,
  eventsFor,
  fromSolar,
  lunar,
  monthDates,
  parseSolarInput,
  solar,
} from "./calendar";
import {
  applySwap,
  generateSchedule,
  personStats,
  recordAttendance,
} from "./scheduler";
import { validateBackup } from "./storage";

function fixture(count = 16): AppData {
  return {
    version: 1,
    demo: false,
    people: Array.from({ length: count }, (_, i) => ({
      id: String(1001 + i),
      name: `فرد ${i}`,
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
  };
}
describe("offline calendars", () => {
  it("converts Nowruz and valid leap dates in both directions", () => {
    expect(fromSolar(1404, 1, 1)).toBe("2025-03-21");
    expect(solar("2025-03-20")).toEqual({ jy: 1403, jm: 12, jd: 30 });
    expect(monthDates(1403, 12)).toHaveLength(30);
    expect(monthDates(1404, 12)).toHaveLength(29);
    expect(() => fromSolar(1404, 12, 30)).toThrow();
    expect(parseSolarInput("۱۴۰۵/۰۸/۱۷")).toBe("2026-11-08");
  });
  it("counts Friday, Nowruz and custom holidays without counting non-holiday occasions", () => {
    expect(dayOfWeek("2026-11-06")).toBe(6);
    expect(eventsFor("2026-11-06").holiday).toBe(true);
    expect(eventsFor(fromSolar(1405, 1, 1)).holiday).toBe(true);
    const date = "2026-11-08";
    expect(
      eventsFor(date, [{ date, title: "تعطیلی سازمان", holiday: true }])
        .holiday,
    ).toBe(true);
    expect(
      eventsFor(fromSolar(1405, 8, 13)).events.some(
        (e) => e.title === "روز دانش‌آموز",
      ),
    ).toBe(true);
  });
  it("allows a local lunar adjustment without a remote calendar API", () => {
    const a = lunar("2026-11-08", 1),
      b = lunar("2026-11-09", 0);
    expect(a).toEqual(b);
  });
  it("lets an official local correction replace a calculated holiday", () => {
    const friday = "2026-11-06";
    expect(
      eventsFor(friday, [
        {
          date: friday,
          title: "روز کاری سازمان",
          holiday: false,
          override: true,
        },
      ]).holiday,
    ).toBe(false);
    expect(
      eventsFor(friday, [
        { date: friday, title: "مناسبت عادی", holiday: false },
      ]).holiday,
    ).toBe(true);
  });
});
describe("fair daily scheduling", () => {
  it.each([1, 2, 6, 8, 12])(
    "covers month %s with two distinct main and two reserve staff per day",
    (month) => {
      const data = fixture();
      data.shifts = generateSchedule(data, 1405, month).shifts;
      expect(data.shifts).toHaveLength(monthDates(1405, month).length);
      for (const s of data.shifts) {
        expect(s.primary).toHaveLength(2);
        expect(s.reserve).toHaveLength(2);
        expect(new Set([...s.primary, ...s.reserve]).size).toBe(4);
      }
      const stats = data.people.map((p) =>
        personStats(p.id, data.shifts, data),
      );
      expect(
        Math.max(...stats.map((s) => s.total)) -
          Math.min(...stats.map((s) => s.total)),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.max(...stats.map((s) => s.holiday)) -
          Math.min(...stats.map((s) => s.holiday)),
      ).toBeLessThanOrEqual(1);
      for (const p of data.people) {
        const days = data.shifts
          .filter((s) => s.primary.includes(p.id))
          .map((s) => s.date);
        for (let i = 1; i < days.length; i++)
          expect(dayDistance(days[i], days[i - 1])).toBeGreaterThan(1);
      }
    },
  );
  it("is deterministic and uses earlier months to balance cumulative holiday duty", () => {
    const data = fixture();
    expect(generateSchedule(data, 1405, 7)).toEqual(
      generateSchedule(data, 1405, 7),
    );
    data.shifts = generateSchedule(data, 1405, 7).shifts;
    const earlier = structuredClone(data.shifts);
    data.shifts = generateSchedule(data, 1405, 8).shifts;
    expect(
      data.shifts.filter((s) => earlier.some((e) => e.date === s.date)),
    ).toEqual(earlier);
    const st = data.people.map((p) => personStats(p.id, data.shifts, data));
    expect(
      Math.max(...st.map((s) => s.holiday)) -
        Math.min(...st.map((s) => s.holiday)),
    ).toBeLessThanOrEqual(1);
  });
  it("excludes inactive staff and restricts dedicated reserves", () => {
    const data = fixture();
    data.people[0].active = false;
    data.people[1].reserveOnly = true;
    const result = generateSchedule(data, 1405, 8);
    expect(
      result.shifts.some((s) => [...s.primary, ...s.reserve].includes("1001")),
    ).toBe(false);
    expect(result.shifts.some((s) => s.primary.includes("1002"))).toBe(false);
    expect(result.shifts.some((s) => s.reserve.includes("1002"))).toBe(true);
  });
  it("fails insufficient headcounts and reports impossible rest constraints", () => {
    expect(() => generateSchedule(fixture(3), 1405, 8)).toThrow("کافی");
    const result = generateSchedule(fixture(4), 1405, 8);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(
      result.shifts.every(
        (s) => new Set([...s.primary, ...s.reserve]).size === 4,
      ),
    ).toBe(true);
  });
});
describe("attendance and auditable swaps", () => {
  it("records absences and replacement without erasing the original assignment", () => {
    const data = fixture();
    data.settings.minRestDays = 0;
    data.shifts = generateSchedule(data, 1405, 8).shifts;
    const s = data.shifts[0];
    const updated = recordAttendance(
      data,
      s.date,
      s.primary[0],
      "excused",
      "بیماری",
      s.reserve[0],
    );
    expect(updated.shifts[0].primary).toEqual(s.primary);
    expect(updated.shifts[0].attendance[0]).toMatchObject({
      status: "excused",
      replacementId: s.reserve[0],
      note: "بیماری",
    });
    expect(() =>
      recordAttendance(
        updated,
        s.date,
        s.primary[1],
        "unexcused",
        "",
        s.reserve[0],
      ),
    ).toThrow("قبلاً");
    expect(() =>
      recordAttendance(data, s.date, s.primary[0], "present", "", s.reserve[0]),
    ).toThrow();
    const absent = personStats(s.primary[0], updated.shifts, updated);
    const replacement = personStats(s.reserve[0], updated.shifts, updated);
    expect(absent.workload).toBe(absent.total - 1);
    expect(replacement.workload).toBe(replacement.total + 1);
    expect(replacement.replacements).toBe(1);
    expect(() => generateSchedule(updated, 1405, 8)).toThrow("سوابق");
  });
  it("exchanges main and reserve roles on the same day with an immutable audit record", () => {
    const data = fixture();
    data.settings.minRestDays = 0;
    data.shifts = generateSchedule(data, 1405, 8).shifts;
    const s = data.shifts[0];
    const before = structuredClone(data);
    const updated = applySwap(data, {
      firstDate: s.date,
      secondDate: s.date,
      firstId: s.primary[0],
      secondId: s.reserve[0],
      note: "با توافق",
    });
    expect(updated.shifts[0].primary).toContain(s.reserve[0]);
    expect(updated.shifts[0].reserve).toContain(s.primary[0]);
    expect(updated.swaps).toHaveLength(1);
    expect(data).toEqual(before);
    expect(
      new Set([...updated.shifts[0].primary, ...updated.shifts[0].reserve])
        .size,
    ).toBe(4);
  });
  it("exchanges two separate days and refuses overlaps, same person and recorded attendance", () => {
    const data = fixture();
    data.settings.minRestDays = 0;
    data.shifts = generateSchedule(data, 1405, 8).shifts;
    const a = data.shifts[0],
      b = data.shifts.find(
        (s) =>
          s.date !== a.date &&
          s.primary.some((id) => ![...a.primary, ...a.reserve].includes(id)) &&
          !s.reserve.includes(a.primary[0]) &&
          !s.primary.includes(a.primary[0]),
      )!;
    const secondId = b.primary.find(
      (id) => ![...a.primary, ...a.reserve].includes(id),
    )!;
    const input = {
      firstDate: a.date,
      secondDate: b.date,
      firstId: a.primary[0],
      secondId,
      note: "",
    };
    const result = applySwap(data, input);
    expect(result.shifts.find((s) => s.date === a.date)!.primary).toContain(
      secondId,
    );
    expect(result.shifts.find((s) => s.date === b.date)!.primary).toContain(
      a.primary[0],
    );
    expect(() =>
      applySwap(data, { ...input, secondId: a.primary[0] }),
    ).toThrow();
    const attended = recordAttendance(
      data,
      a.date,
      a.primary[0],
      "present",
      "",
    );
    expect(() => applySwap(attended, input)).toThrow("حضور");
  });
});
describe("backup validation", () => {
  it("round-trips all records and rejects duplicate and unknown staff references", () => {
    const data = fixture();
    data.shifts = generateSchedule(data, 1405, 8).shifts;
    expect(validateBackup(JSON.parse(JSON.stringify(data)))).toEqual(data);
    const duplicate = structuredClone(data);
    duplicate.shifts[0].reserve[0] = duplicate.shifts[0].primary[0];
    expect(() => validateBackup(duplicate)).toThrow();
    const unknown = structuredClone(data);
    unknown.shifts[0].primary[0] = "unknown";
    expect(() => validateBackup(unknown)).toThrow();
    expect(() =>
      validateBackup({
        ...data,
        settings: { ...data.settings, primaryCount: -1 },
      }),
    ).toThrow();
  });
});
