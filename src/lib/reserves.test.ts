import { describe, it, expect } from "vitest";
import type { AppData } from "../types";
import {
  updateReserves,
  recordAttendance,
  reserveDutyConflicts,
  generateSchedule,
  personStats,
} from "./scheduler";
import { validateBackup } from "./storage";
function fixture(): AppData {
  return {
    version: 1,
    demo: false,
    people: "ABCDEFGH".split("").map((id) => ({
      id,
      name: `همکار ${id}`,
      department: "عملیات",
      active: true,
      reserveOnly: false,
    })),
    shifts: [
      {
        date: "2026-11-01",
        primary: ["A", "B"],
        reserve: ["C", "D"],
        attendance: [],
      },
    ],
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
describe("manual reserve assignments", () => {
  it("selects people outside the generated pair, preserves the other slot and audits old/new names", () => {
    const data = fixture(),
      before = structuredClone(data);
    const next = updateReserves(data, "2026-11-01", ["E", "D"], "با هماهنگی");
    expect(data).toEqual(before);
    expect(next.shifts[0].primary).toEqual(["A", "B"]);
    expect(next.shifts[0].reserve).toEqual(["E", "D"]);
    expect(next.reserveChanges?.[0]).toMatchObject({
      date: "2026-11-01",
      previousIds: ["C", "D"],
      nextIds: ["E", "D"],
      note: "با هماهنگی",
      source: "manual",
    });
    expect(personStats("E", next.shifts, next).reserve).toBe(1);
    expect(personStats("C", next.shifts, next).reserve).toBe(0);
    expect(validateBackup(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(() => generateSchedule(next, 1405, 8)).toThrow("ویرایش رزرو");
  });
  it("rejects duplicate, main-duty, unknown and newly inactive personnel but permits capacity changes", () => {
    const data = fixture();
    data.people[4].active = false;
    for (const ids of [
      ["C", "C"],
      ["A", "D"],
      ["unknown", "D"],
      ["E", "D"],
    ])
      expect(() => updateReserves(data, "2026-11-01", ids)).toThrow();
    expect(data.reserveChanges).toBeUndefined();
    expect(updateReserves(data, "2026-11-01", ["C"]).shifts[0].reserve).toEqual(
      ["C"],
    );
    expect(updateReserves(data, "2026-11-01", ["D", "C"])).toBe(data);
    expect(() => updateReserves(data, "2030-01-01", ["F", "G"])).toThrow(
      "برنامه",
    );
  });
  it("keeps any reserve with recorded replacement attendance, while unused slots remain editable", () => {
    const data = recordAttendance(
      fixture(),
      "2026-11-01",
      "A",
      "excused",
      "بیماری",
      "C",
    );
    expect(() => updateReserves(data, "2026-11-01", ["E", "D"])).toThrow(
      "حضور جایگزین",
    );
    const next = updateReserves(data, "2026-11-01", ["C", "E"]);
    expect(next.shifts[0].attendance).toEqual(data.shifts[0].attendance);
    expect(next.shifts[0].reserve).toEqual(["C", "E"]);
  });
  it("atomically replaces an unused reserve with an outside employee during absence registration", () => {
    const data = fixture();
    const next = recordAttendance(
      data,
      "2026-11-01",
      "A",
      "unexcused",
      "تماس گرفته شد",
      "E",
      "D",
    );
    expect(next.shifts[0].reserve).toEqual(["C", "E"]);
    expect(next.shifts[0].attendance[0]).toMatchObject({
      personId: "A",
      status: "unexcused",
      replacementId: "E",
    });
    expect(next.reserveChanges?.[0]).toMatchObject({
      source: "attendance",
      previousIds: ["C", "D"],
      nextIds: ["C", "E"],
    });
    expect(data.shifts[0].reserve).toEqual(["C", "D"]);
    expect(validateBackup(next)).toEqual(next);
    expect(() =>
      recordAttendance(data, "2026-11-01", "A", "excused", "", "E"),
    ).toThrow("کدام رزرو");
    expect(() =>
      recordAttendance(next, "2026-11-01", "B", "excused", "", "F", "E"),
    ).toThrow("حضور جایگزین");
  });
  it("does not leak a roster change or audit if the actual replacement violates rest", () => {
    const data = fixture();
    data.shifts.push({
      date: "2026-11-02",
      primary: ["E", "F"],
      reserve: ["G", "H"],
      attendance: [],
    });
    const before = structuredClone(data);
    expect(reserveDutyConflicts(data, "2026-11-01", "E")).toHaveLength(1);
    expect(() =>
      recordAttendance(data, "2026-11-01", "A", "excused", "", "E", "C"),
    ).toThrow("استراحت");
    expect(data).toEqual(before);
    expect(
      updateReserves(data, "2026-11-01", ["E", "D"]).reserveChanges,
    ).toHaveLength(1);
  });
  it("accepts older backups and rejects corrupt reserve-change histories", () => {
    const data = fixture();
    expect(validateBackup(data)).toBe(data);
    const next = updateReserves(data, "2026-11-01", ["E", "D"]);
    const bad = structuredClone(next);
    bad.reserveChanges![0].nextIds = ["missing", "D"];
    expect(() => validateBackup(bad)).toThrow();
    const duplicate = structuredClone(next);
    duplicate.reserveChanges!.push(duplicate.reserveChanges![0]);
    expect(() => validateBackup(duplicate)).toThrow();
  });
});
