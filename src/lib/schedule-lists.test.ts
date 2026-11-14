import { describe, expect, it } from "vitest";
import type { AppData, PersonRole } from "../types";
import {
  editShift,
  generateRangeSchedule,
  renameScheduleList,
} from "./planning";
import { recordAttendance } from "./scheduler";
import { reserveQueue, shiftKey } from "./shift-utils";
import { validateBackup } from "./storage";

function fixture(): AppData {
  return {
    version: 1,
    demo: false,
    people: Array.from({ length: 40 }, (_, i) => ({
      id: String(i + 1),
      name: `فرد ${i + 1}`,
      department: "",
      active: true,
      role: (i < 12
        ? "leader"
        : i < 32
          ? "companion"
          : "reserve") as PersonRole,
      reserveOnly: i >= 32,
    })),
    shifts: [],
    swaps: [],
    events: [],
    settings: {
      primaryCount: 2,
      reserveCount: 2,
      minRestDays: 0,
      hijriOffset: 0,
    },
  };
}
const addList = (
  data: AppData,
  name: string,
  mode: "parallel" | "alternative" = "parallel",
) =>
  generateRangeSchedule(data, {
    title: name,
    listName: name,
    listMode: mode,
    startDate: "2026-11-01",
    endDate: "2026-11-03",
    leaderCount: 1,
    companionCount: 1,
    reserveCount: 2,
    peopleIds: data.people.map((p) => p.id),
  });

describe("named schedule lists for the same period", () => {
  it("checks actual rest across real locations during manual edits", () => {
    const source = fixture();
    source.settings.minRestDays = 1;
    const first = addList(source, "موقعیت اول");
    const second = addList(first, "موقعیت دوم");
    const original = first.shifts[0];
    const target = second.shifts.find(
      (s) =>
        s.listId === second.scheduleLists![1].id && s.date === "2026-11-02",
    )!;
    const id = original.primary[0];
    const roster = {
      primary: [id, target.primary[1]],
      leaders: [id],
      reserve: target.reserve,
    };
    expect(() =>
      editShift(second, shiftKey(target), roster, "شیفت اضافه"),
    ).toThrow("استراحت");
    expect(
      editShift(second, shiftKey(target), roster, "شیفت اضافه با تأیید", true)
        .shiftChanges![0].restOverride,
    ).toBe(true);
  });
  it("keeps four real locations for the same dates, with no shared primary or reserve on a day", () => {
    let data = fixture();
    for (const name of ["ساختمان مرکزی", "بخش دوم", "نگهبانی", "کارگاه"])
      data = addList(data, name);
    expect(data.scheduleLists).toHaveLength(4);
    expect(data.plans).toHaveLength(4);
    expect(data.shifts).toHaveLength(12);
    expect(new Set(data.shifts.map(shiftKey)).size).toBe(12);
    for (const date of ["2026-11-01", "2026-11-02", "2026-11-03"]) {
      const people = data.shifts
        .filter((s) => s.date === date)
        .flatMap((s) => [...s.primary, ...s.reserve]);
      expect(people).toHaveLength(16);
      expect(new Set(people).size).toBe(16);
    }
    expect(validateBackup(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
  it("generates distinct alternative arrangements without consuming real-location capacity or history", () => {
    let data = fixture();
    const before = addList(data, "اجرای واقعی");
    data = before;
    for (const name of [
      "پیشنهاد اول",
      "پیشنهاد دوم",
      "پیشنهاد سوم",
      "حالت ویژه",
    ])
      data = addList(data, name, "alternative");
    const first = data.shifts.filter(
      (s) =>
        s.date === "2026-11-01" && s.listId !== before.scheduleLists![0].id,
    );
    expect(new Set(first.map((s) => s.primary.join(","))).size).toBe(4);
    expect(
      data.shifts.filter((s) => s.listId === before.scheduleLists![0].id),
    ).toEqual(before.shifts);
    expect(validateBackup(data)).toEqual(data);
  });
  it("rejects overlap inside one list and preserves another list when editing attendance or rotating reserves", () => {
    const first = addList(fixture(), "مرکزی");
    const data = addList(first, "بخش دوم");
    expect(() => addList(data, "مرکزی")).toThrow("سوابق حفظ");
    const target = data.shifts.find(
      (s) => s.listId === data.scheduleLists![0].id,
    )!;
    const otherId = data.scheduleLists![1].id;
    const beforeQueue = reserveQueue(data, otherId);
    const updated = recordAttendance(
      data,
      shiftKey(target),
      target.primary[0],
      "excused",
      "خدمت واقعی",
      target.reserve[0],
    );
    expect(reserveQueue(updated, target.listId).at(-1)).toBe(target.reserve[0]);
    expect(reserveQueue(updated, otherId)).toEqual(beforeQueue);
    expect(updated.shifts.filter((s) => s.listId === otherId)).toEqual(
      data.shifts.filter((s) => s.listId === otherId),
    );
  });
  it("can append a later period to an existing location and rename it without losing records", () => {
    const first = addList(fixture(), "مرکزی");
    const listId = first.scheduleLists![0].id;
    const later = generateRangeSchedule(first, {
      title: "ماه دوم",
      listId,
      startDate: "2026-12-01",
      endDate: "2026-12-02",
      leaderCount: 1,
      companionCount: 1,
      reserveCount: 0,
      peopleIds: first.people.map((p) => p.id),
    });
    expect(later.scheduleLists).toHaveLength(1);
    const renamed = renameScheduleList(later, listId, "موقعیت ویژه");
    expect(renamed.scheduleLists![0].name).toBe("موقعیت ویژه");
    expect(renamed.shifts).toEqual(later.shifts);
    expect(renamed.plans).toHaveLength(2);
    expect(validateBackup(renamed)).toEqual(renamed);
  });
  it("reports too few staff for another real location and never silently double-books them", () => {
    const data = fixture();
    data.people = [
      data.people[0],
      data.people[12],
      data.people[32],
      data.people[33],
    ];
    const first = addList(data, "بخش اول");
    expect(() => addList(first, "بخش دوم")).toThrow("تداخل");
    const alternative = addList(first, "پیشنهاد جایگزین", "alternative");
    expect(alternative.scheduleLists).toHaveLength(2);
  });
  it("rejects missing or duplicated list metadata in backup and accepts older backups", () => {
    expect(validateBackup(fixture())).toEqual(fixture());
    const data = addList(fixture(), "بخش اول");
    expect(() => validateBackup({ ...data, scheduleLists: [] })).toThrow();
    expect(() =>
      validateBackup({
        ...data,
        scheduleLists: [
          ...data.scheduleLists!,
          { ...data.scheduleLists![0], id: "other" },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateBackup({ ...data, reserveQueues: { missing: [] } }),
    ).toThrow();
    const two = addList(data, "بخش دوم");
    expect(() =>
      renameScheduleList(two, two.scheduleLists![1].id, "بخش اول"),
    ).toThrow("تکراری");
  });
});
