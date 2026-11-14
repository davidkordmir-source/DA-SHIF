import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import type { AppData } from "../types";
import {
  archiveSchedule,
  dateRange,
  historyShifts,
  scheduleLists,
} from "./schedules";
import {
  createSchedule,
  generateSchedule,
  recordAttendance,
  reserveDutyConflicts,
} from "./scheduler";
import { reportRows, type ReportFilters } from "./reports";
import { validateBackup } from "./storage";
import { buildReportWorkbook, buildScheduleWorkbook } from "./excel";
import { dueReminders } from "../../electron/reminders.mjs";

const fixture = (): AppData => ({
  version: 1,
  demo: false,
  people: Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    name: `همکار ${i}`,
    department: i % 2 ? "عملیات" : "اداری",
    active: true,
    reserveOnly: false,
  })),
  shifts: [],
  swaps: [],
  events: [],
  locations: ["ساختمان اصلی"],
  settings: {
    primaryCount: 2,
    reserveCount: 2,
    minRestDays: 1,
    hijriOffset: 0,
  },
});
const make = (data = fixture(), start = "2026-11-01", end = "2026-11-04") =>
  createSchedule(data, {
    name: "تیم صبح",
    start,
    end,
    personIds: data.people.filter((p) => p.active).map((p) => p.id),
    location: "ساختمان اصلی",
  });
const archive = (
  data: AppData,
  rights: "preserve" | "mistake" = "preserve",
  today = "2026-11-04",
) =>
  archiveSchedule(
    data,
    data.schedules![0].id,
    {
      reason: "اصلاح برنامه",
      recordedBy: "مسئول شیفت",
      restAcknowledged: true,
      rights,
    },
    today,
  );
const filters: ReportFilters = {
  start: "2026-11-01",
  end: "2026-11-04",
  personId: "",
  department: "",
  status: "",
  scheduleId: "",
  location: "",
  dayType: "",
  includeArchive: true,
};

describe("named rosters and protected rights", () => {
  it("gives legacy monthly plans stable list IDs without changing their data", () => {
    const data = fixture();
    data.shifts = generateSchedule(data, 1405, 8).shifts;
    const json = JSON.stringify(data),
      lists = scheduleLists(data);
    expect(lists).toHaveLength(1);
    expect(lists[0].id).toBe("legacy:1405-8");
    expect(scheduleLists(validateBackup(JSON.parse(json)))).toEqual(lists);
    expect(JSON.stringify(data)).toBe(json);
  });
  it("generates cross-month ranges with only the selected staff and location", () => {
    const data = fixture(),
      ids = ["0", "1", "2", "3", "4", "5"];
    const result = createSchedule(data, {
      name: "تیم نوروز",
      start: "2027-03-18",
      end: "2027-03-24",
      personIds: ids,
      location: data.locations![0],
    });
    expect(result.shifts).toHaveLength(7);
    expect(
      result.shifts.every((s) =>
        [...s.primary, ...s.reserve].every((id) => ids.includes(id)),
      ),
    ).toBe(true);
    expect(new Set(result.shifts.map((s) => s.scheduleId)).size).toBe(1);
    expect(validateBackup(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(data.shifts).toHaveLength(0);
  });
  it("rejects invalid, reversed or excessive ranges and prevents silent overwriting", () => {
    expect(() => dateRange("2026-02-30", "2026-03-01")).toThrow();
    expect(() => dateRange("2026-11-04", "2026-11-01")).toThrow();
    expect(() => dateRange("2026-01-01", "2027-01-02")).toThrow();
    expect(() => make(make())).toThrow(/حق شیفت/);
    expect(() => make(archive(make()))).toThrow(/حق شیفت/);
  });
  it("records an immutable snapshot, keeps completed rights, cancels future work and disables that list's reminder", () => {
    const data = make();
    data.reminder = {
      enabled: true,
      scheduleId: data.schedules![0].id,
      time: "08:00",
      daysBefore: 1,
    };
    const next = archive(data, "preserve", "2026-11-02");
    expect(next.shifts).toEqual([]);
    expect(next.schedules).toEqual([]);
    expect(next.reminder?.enabled).toBe(false);
    expect(next.archives![0].creditedDates).toEqual([
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(next.archives![0].snapshot.shifts).toEqual(data.shifts);
    expect(historyShifts(next)).toHaveLength(2);
    expect(validateBackup(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(data.shifts).toHaveLength(4);
  });
  it("does not count an unexecuted mistaken list as work, but retains the deletion document", () => {
    const next = archive(make(), "mistake");
    expect(historyShifts(next)).toEqual([]);
    expect(next.archives![0].reason).toBe("اصلاح برنامه");
    expect(make(next).shifts).toHaveLength(4);
  });
  it("requires accountability and cannot discard attendance or changes as a mistake", () => {
    const data = make(),
      shift = data.shifts[0];
    const attended = recordAttendance(
      data,
      shift.date,
      shift.primary[0],
      "present",
      "ثبت واقعی",
    );
    expect(() => archive(attended, "mistake")).toThrow(/سابقه/);
    expect(() =>
      archiveSchedule(data, data.schedules![0].id, {
        reason: "",
        recordedBy: "مدیر",
        rights: "preserve",
        restAcknowledged: true,
      }),
    ).toThrow();
    const next = archive(attended);
    expect(next.archives![0].snapshot.shifts[0].attendance[0].note).toBe(
      "ثبت واقعی",
    );
  });
  it("uses archived workload for fairness and rest just like retained completed shifts", () => {
    const original = make(),
      archived = archive(original),
      nextDates = dateRange("2026-11-05", "2026-11-20");
    const a = generateSchedule(original, 0, 0, nextDates),
      b = generateSchedule(archived, 0, 0, nextDates);
    expect(a.shifts.filter((s) => nextDates.includes(s.date))).toEqual(
      b.shifts,
    );
    const last = original.shifts.at(-1)!;
    expect(
      reserveDutyConflicts(archived, "2026-11-05", last.primary[0]),
    ).toHaveLength(1);
    const reducedRest = {
      ...archived,
      settings: { ...archived.settings, minRestDays: 0 },
    };
    expect(
      reserveDutyConflicts(reducedRest, "2026-11-05", last.primary[0]),
    ).toHaveLength(1);
  });
  it("keeps a cross-list swap visible for the surviving list and in the deletion document", () => {
    const first = make();
    const both = make(first, "2026-11-05", "2026-11-07");
    both.swaps = [
      {
        id: "cross-list",
        createdAt: "2026-11-07T09:00:00Z",
        firstDate: "2026-11-04",
        secondDate: "2026-11-05",
        firstId: "0",
        secondId: "1",
        note: "توافق دو فهرست",
      },
    ];
    const next = archive(both);
    expect(next.swaps).toEqual(both.swaps);
    expect(next.archives![0].snapshot.swaps).toEqual(both.swaps);
    expect(validateBackup(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
  it("rejects malformed new fields and duplicate credited history on restore", () => {
    const data = make();
    expect(() =>
      validateBackup({
        ...data,
        schedules: [{ ...data.schedules![0], personIds: ["missing"] }],
      }),
    ).toThrow();
    expect(() =>
      validateBackup({
        ...data,
        reminder: {
          enabled: true,
          scheduleId: "missing",
          time: "08:00",
          daysBefore: 0,
        },
      }),
    ).toThrow();
    const archived = archive(data);
    expect(() =>
      validateBackup({
        ...archived,
        archives: [
          archived.archives![0],
          { ...archived.archives![0], id: "other" },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateBackup({
        ...data,
        appearance: { theme: "emerald", font: "vazirmatn", fontScale: 999 },
      }),
    ).toThrow();
  });
});

describe("filtered reports and workbooks", () => {
  it("distinguishes unrecorded, absent, replacement and no-duty staff", () => {
    let data = make();
    const shift = data.shifts[0];
    // Rest is deliberately disabled for this attendance/report fixture.
    data = { ...data, settings: { ...data.settings, minRestDays: 0 } };
    data = recordAttendance(
      data,
      shift.date,
      shift.primary[0],
      "excused",
      "مرخصی",
      shift.reserve[0],
    );
    const rows = reportRows(data, {
      ...filters,
      start: shift.date,
      end: shift.date,
    });
    expect(rows.find((r) => r.personId === shift.primary[0])?.status).toBe(
      "excused",
    );
    expect(rows.find((r) => r.personId === shift.primary[1])?.status).toBe(
      "unrecorded",
    );
    expect(rows.find((r) => r.personId === shift.reserve[0])?.status).toBe(
      "replacement",
    );
    const off = reportRows(data, {
      ...filters,
      start: shift.date,
      end: shift.date,
      status: "off",
    });
    expect(off).toHaveLength(8);
    expect(
      off.every(
        (r) => ![...shift.primary, ...shift.reserve].includes(r.personId),
      ),
    ).toBe(true);
    expect(
      reportRows(data, {
        ...filters,
        start: "2026-12-01",
        end: "2026-12-02",
        status: "off",
      }),
    ).toEqual([]);
  });
  it("applies department, person, date, location and archive filters to the same rows as export", () => {
    const data = make(),
      row = reportRows(data, filters)[0];
    const selected = {
      ...filters,
      start: row.date,
      end: row.date,
      department: row.department,
      personId: row.personId,
      location: row.location,
      scheduleId: data.schedules![0].id,
    };
    expect(reportRows(data, selected)).toHaveLength(1);
    expect(
      reportRows(data, { ...selected, location: "جای دیگر" }),
    ).toHaveLength(0);
    const archived = archive(data);
    expect(reportRows(archived, selected)).toHaveLength(1);
    expect(
      reportRows(archived, { ...selected, includeArchive: false }),
    ).toHaveLength(0);
    const sheet = buildReportWorkbook(archived, selected).worksheets[0];
    expect(sheet.rowCount).toBe(6);
    expect(sheet.getRow(6).getCell(6).text).toBe(row.name);
  });
  it("writes dated, colored, filterable RTL workbooks with weekdays and printable titles", async () => {
    const data = make(),
      workbook = buildScheduleWorkbook(
        data,
        data.shifts.map((s) => s.date),
      );
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(await workbook.xlsx.writeBuffer());
    const sheet = restored.worksheets[0];
    expect(sheet.getRow(1).getCell(1).text).toContain("برنامهٔ شیفت");
    expect(sheet.getRow(2).getCell(1).text).toContain("تهیه‌شده");
    expect(sheet.getRow(5).getCell(3).text).toBe("روز");
    expect(sheet.getRow(6).getCell(3).text.length).toBeGreaterThan(2);
    expect(sheet.getRow(6).getCell(10).text).toBe("ساختمان اصلی");
    expect(sheet.views[0].rightToLeft).toBe(true);
    expect(sheet.views[0].state).toBe("frozen");
    expect(sheet.pageSetup.orientation).toBe("landscape");
    expect(sheet.autoFilter).toBeTruthy();
    expect(sheet.getRow(5).getCell(1).fill).toMatchObject({
      type: "pattern",
      fgColor: { argb: "FF147E68" },
    });
    expect(sheet.getRow(6).getCell(1).fill).not.toEqual(
      sheet.getRow(7).getCell(1).fill,
    );
  });
});

describe("Tehran shift reminders", () => {
  it("targets only the chosen roster and catches up after its local time", () => {
    const data = make();
    data.reminder = {
      enabled: true,
      scheduleId: data.schedules![0].id,
      time: "08:00",
      daysBefore: 1,
    };
    expect(dueReminders(data, new Date("2026-10-31T04:29:00Z"))).toEqual([]);
    const due = dueReminders(data, new Date("2026-10-31T04:30:00Z"));
    expect(due).toHaveLength(1);
    expect(due[0].body).toContain("ساختمان اصلی");
    expect(dueReminders(data, new Date("2026-10-31T20:29:00Z"))[0].key).toBe(
      due[0].key,
    );
    expect(
      dueReminders(
        { ...data, reminder: { ...data.reminder, scheduleId: "other" } },
        new Date("2026-10-31T04:30:00Z"),
      ),
    ).toEqual([]);
    expect(
      dueReminders(archive(data), new Date("2026-10-31T04:30:00Z")),
    ).toEqual([]);
  });
  it("supports old monthly lists across Tehran midnight without notifying on unplanned dates", () => {
    const data = fixture();
    data.shifts = generateSchedule(data, 1405, 8).shifts;
    data.reminder = {
      enabled: true,
      scheduleId: "legacy:1405-8",
      time: "00:00",
      daysBefore: 0,
    };
    expect(dueReminders(data, new Date("2026-11-01T20:30:00Z"))).toHaveLength(
      1,
    );
    expect(dueReminders(data, new Date("2026-12-01T20:30:00Z"))).toEqual([]);
  });
});
