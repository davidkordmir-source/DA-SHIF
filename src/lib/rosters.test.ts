import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import type {
  AppData,
  Person,
  PersonnelCategory,
  ScheduleRosters,
} from "../types";
import { createSchedule, applySwap, personStats } from "./scheduler";
import { mergeImportedPeople, personnelRoster } from "./people";
import { readPeople, buildScheduleWorkbook } from "./excel";
import { parseBackup, validateBackup } from "./storage";
import { archiveSchedule } from "./schedules";

const person = (id: string, category: PersonnelCategory): Person => ({
  id,
  name: `عضو ${id}`,
  category,
  active: true,
  reserveOnly: category === "reserve",
  department: "عملیات",
});
const fixture = (): AppData => ({
  version: 1,
  demo: false,
  people: [
    person("90", "night-lead"),
    person("2", "night-lead"),
    person("51", "night-lead"),
    person("C8", "companion"),
    person("C1", "companion"),
    person("R9", "reserve"),
    person("R1", "reserve"),
    person("R7", "reserve"),
  ],
  shifts: [],
  swaps: [],
  events: [{ date: "2026-11-02", title: "تعطیل نمونه", holiday: true }],
  settings: {
    primaryCount: 2,
    reserveCount: 2,
    minRestDays: 0,
    hijriOffset: 0,
  },
});
const rosters = (withCompanions = true): ScheduleRosters => ({
  nightLeadIds: ["90", "2", "51"],
  companionIds: withCompanions ? ["C8", "C1"] : [],
  reserveIds: ["R9", "R1", "R7"],
  reserveCount: 2,
});
const make = (data = fixture(), lists = rosters()) =>
  createSchedule(data, {
    name: "ترتیب اکسل",
    start: "2026-11-01",
    end: "2026-11-07",
    rosters: lists,
  });

describe("separate rosters in spreadsheet order", () => {
  it("keeps dates, spreadsheet rows and each role's independent rotation in order, including holidays", () => {
    const data = make();
    expect(data.shifts.map((s) => s.primary)).toEqual([
      ["90", "C8"],
      ["2", "C1"],
      ["51", "C8"],
      ["90", "C1"],
      ["2", "C8"],
      ["51", "C1"],
      ["90", "C8"],
    ]);
    expect(
      data.shifts.every(
        (s) => s.primaryRoles?.join() === "night-lead,companion",
      ),
    ).toBe(true);
    expect(data.shifts.slice(0, 3).map((s) => s.reserve)).toEqual([
      ["R9", "R1"],
      ["R7", "R9"],
      ["R1", "R7"],
    ]);
    expect(
      data.shifts.every((s) => s.reserve.every((id) => id.startsWith("R"))),
    ).toBe(true);
    expect(validateBackup(data)).toEqual(data);
  });

  it("makes single-person shifts when companions are declined, even if companion staff exist and global capacity is larger", () => {
    const data = fixture();
    data.settings.primaryCount = 20;
    const result = make(data, rosters(false));
    expect(result.shifts.map((s) => s.primary)).toEqual([
      ["90"],
      ["2"],
      ["51"],
      ["90"],
      ["2"],
      ["51"],
      ["90"],
    ]);
    expect(
      result.shifts.every((s) => s.primaryRoles?.join() === "night-lead"),
    ).toBe(true);
    expect(result.schedules![0].personIds).not.toContain("C8");
    expect(result.shifts.every((s) => s.reserve.length === 2)).toBe(true);
    const noReserve = make(fixture(), {
      ...rosters(false),
      reserveIds: [],
      reserveCount: 0,
    });
    expect(noReserve.shifts.every((s) => !s.reserve.length)).toBe(true);
  });

  it("reimports existing IDs in the new file order instead of sorting IDs or reusing old positions", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("مسئول شب").addRows([
      ["کد پرسنلی", "نام و نام خانوادگی"],
      ["51", "عضو 51"],
      ["90", "عضو 90"],
      ["2", "عضو 2"],
    ]);
    const file = new File(
      [(await wb.xlsx.writeBuffer()) as ArrayBuffer],
      "ordered.xlsx",
    );
    const imported = await readPeople(file);
    expect(imported.people.map((p) => p.id)).toEqual(["51", "90", "2"]);
    const data = fixture();
    data.people = mergeImportedPeople(data.people, imported.people);
    const result = make(data);
    expect(result.shifts.slice(0, 4).map((s) => s.primary[0])).toEqual([
      "51",
      "90",
      "2",
      "51",
    ]);
    expect(result.schedules![0].rosters!.nightLeadIds).toEqual([
      "51",
      "90",
      "2",
    ]);
    const restored = parseBackup(JSON.stringify(result));
    expect(
      personnelRoster(restored.people, "night-lead").map((p) => p.id),
    ).toEqual(["51", "90", "2"]);
    expect(result.shifts).toEqual(restored.shifts);
    const book = buildScheduleWorkbook(
      result,
      result.shifts.map((s) => s.date),
    );
    expect(
      book.getWorksheet("برنامه شیفت")!.getRow(6).getCell(5).text,
    ).toContain("مسئول شب: عضو 51");
    expect(
      book.getWorksheet("برنامه شیفت")!.getRow(6).getCell(5).text,
    ).toContain("همراه: عضو C8");
  });

  it("keeps unimported members and histories and retains relative row order when selecting a subset", () => {
    const data = fixture();
    data.people = mergeImportedPeople(data.people, [
      data.people[2],
      data.people[0],
    ]);
    expect(personnelRoster(data.people, "night-lead").map((p) => p.id)).toEqual(
      ["51", "90", "2"],
    );
    const result = make(data, { ...rosters(), nightLeadIds: ["2", "51"] });
    expect(result.shifts.slice(0, 3).map((s) => s.primary[0])).toEqual([
      "51",
      "2",
      "51",
    ]);
    expect(data.shifts).toEqual([]);
    expect(data.people).toHaveLength(8);
  });

  it("shows rest conflicts without silently skipping the next spreadsheet row or losing historical credits", () => {
    const previous = createSchedule(fixture(), {
      name: "قبلی",
      start: "2026-10-31",
      end: "2026-10-31",
      rosters: rosters(false),
    });
    previous.settings.minRestDays = 3;
    const archived = archiveSchedule(
      previous,
      previous.schedules![0].id,
      {
        rights: "preserve",
        reason: "بایگانی",
        recordedBy: "مسئول",
        restAcknowledged: true,
      },
      "2026-10-31",
    );
    archived.settings = { ...archived.settings, minRestDays: 0 };
    const result = make(archived, rosters(false));
    expect(result.shifts[0].primary).toEqual(["90"]);
    expect(result.schedulingWarnings!["2026-11-01"].join()).toContain(
      "ترتیب اکسل حفظ شد",
    );
    expect(result.archives).toEqual(archived.archives);
    expect(
      personStats("90", result.archives![0].snapshot.shifts, result).workload,
    ).toBe(1);
    expect(validateBackup(result)).toEqual(result);
  });

  it("does not restart the sequence at a month boundary", () => {
    const data = createSchedule(fixture(), {
      name: "مرز ماه",
      start: "2026-11-20",
      end: "2026-11-24",
      rosters: rosters(),
    });
    expect(data.shifts.map((s) => s.primary[0])).toEqual([
      "90",
      "2",
      "51",
      "90",
      "2",
    ]);
  });

  it("rejects missing, cross-role, duplicate, inactive and insufficient rosters instead of filling slots from another group", () => {
    const data = fixture();
    expect(() =>
      createSchedule(data, {
        name: "نامعتبر",
        start: "2026-11-01",
        end: "2026-11-03",
        personIds: data.people.map((p) => p.id),
      }),
    ).toThrow("جداگانه");
    expect(() => make(data, { ...rosters(), nightLeadIds: [] })).toThrow();
    expect(() => make(data, { ...rosters(), companionIds: ["90"] })).toThrow();
    expect(() =>
      make(data, { ...rosters(), companionIds: ["2", "2"] }),
    ).toThrow();
    expect(() =>
      make(data, { ...rosters(), companionIds: ["missing"] }),
    ).toThrow();
    expect(() => make(data, { ...rosters(), reserveCount: 4 })).toThrow();
    data.people[3].active = false;
    expect(() => make(data)).toThrow("غیرفعال");
  });

  it("preserves role slots during same-role swaps and prevents swapping a companion into a night-lead slot", () => {
    const data = make();
    const sameRole = applySwap(data, {
      firstDate: data.shifts[0].date,
      secondDate: data.shifts[1].date,
      firstId: "90",
      secondId: "2",
      note: "توافق",
    });
    expect(sameRole.shifts[0].primary).toEqual(["2", "C8"]);
    expect(sameRole.shifts[0].primaryRoles).toEqual([
      "night-lead",
      "companion",
    ]);
    expect(() =>
      applySwap(data, {
        firstDate: data.shifts[0].date,
        secondDate: data.shifts[1].date,
        firstId: "90",
        secondId: "C1",
        note: "",
      }),
    ).toThrow("همان نقش");
    expect(validateBackup(sameRole)).toEqual(sameRole);
  });

  it("rejects damaged role/order metadata and preserves it through archive and backup restore", () => {
    const data = make();
    const clone = () => structuredClone(data);
    const invalidRole = clone();
    invalidRole.shifts[0].primaryRoles = ["companion", "night-lead"];
    expect(() => validateBackup(invalidRole)).toThrow();
    const invalidOrder = clone();
    invalidOrder.people[0].rosterOrder = -1;
    expect(() => validateBackup(invalidOrder)).toThrow();
    const missingRole = clone();
    delete missingRole.shifts[0].primaryRoles;
    expect(() => validateBackup(missingRole)).toThrow();
    const invalidList = clone();
    invalidList.schedules![0].rosters!.nightLeadIds.push("C8");
    expect(() => validateBackup(invalidList)).toThrow();
    const archived = archiveSchedule(
      data,
      data.schedules![0].id,
      {
        rights: "preserve",
        reason: "حفظ حق",
        recordedBy: "مسئول",
        restAcknowledged: true,
      },
      "2026-11-07",
    );
    expect(parseBackup(JSON.stringify(archived))).toEqual(archived);
    expect(archived.archives![0].snapshot.shifts[0].primaryRoles).toEqual([
      "night-lead",
      "companion",
    ]);
    expect(() => make(data)).toThrow("حق شیفت");
  });
});
