import { describe, expect, it } from "vitest";
import type { AppData, PersonRole } from "../types";
import {
  editShift,
  generateRangeSchedule,
  rangeDates,
  type PlanningOptions,
} from "./planning";
import {
  recordAttendance,
  applySwap,
  updateReserves,
  personStats,
} from "./scheduler";
import { shiftKey, reserveQueue } from "./shift-utils";
import { validateBackup } from "./storage";

function fixture(): AppData {
  return {
    version: 1,
    demo: false,
    people: Array.from({ length: 40 }, (_, i) => ({
      id: String(i + 1),
      name: `همکار ${i + 1}`,
      department: "عملیات",
      phone: `0912000${String(i).padStart(4, "0")}`,
      active: true,
      reserveOnly: i >= 32,
      role: (i < 16
        ? "leader"
        : i < 32
          ? "companion"
          : "reserve") as PersonRole,
    })),
    shifts: [],
    swaps: [],
    events: [],
    settings: {
      primaryCount: 2,
      leaderCount: 1,
      reserveCount: 2,
      minRestDays: 0,
      hijriOffset: 0,
    },
  };
}
const options = (
  data: AppData,
  extra: Partial<PlanningOptions> = {},
): PlanningOptions => ({
  title: "برنامهٔ تیم",
  startDate: "2026-11-14",
  endDate: "2026-11-14",
  leaderCount: 1,
  companionCount: 1,
  reserveCount: 2,
  peopleIds: data.people.map((p) => p.id),
  ...extra,
});

describe("date-range plans and roles", () => {
  it("keeps shared legacy staff available for categories that have no dedicated staff", () => {
    const data = fixture();
    data.people = data.people.slice(0, 2);
    delete data.people[0].role;
    const next = generateRangeSchedule(
      data,
      options(data, { reserveCount: 0 }),
    );
    expect(next.shifts[0].leaders).toEqual(["2"]);
    expect(next.shifts[0].primary).toEqual(["2", "1"]);
  });
  it("assigns ten distinct people in a single selected day without a monthly dependency", () => {
    const data = fixture(),
      before = structuredClone(data);
    const next = generateRangeSchedule(
      data,
      options(data, { leaderCount: 2, companionCount: 6, reserveCount: 2 }),
    );
    expect(data).toEqual(before);
    expect(next.shifts).toHaveLength(1);
    const shift = next.shifts[0];
    expect(shift.date).toBe("2026-11-14");
    expect(shift.leaders).toHaveLength(2);
    expect(shift.primary).toHaveLength(8);
    expect(new Set([...shift.primary, ...shift.reserve]).size).toBe(10);
    expect(next.plans![0].peopleIds).toHaveLength(40);
    expect(validateBackup(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
  it("covers 365 days across years with forty staff, role separation and balanced workloads", () => {
    const data = fixture();
    const next = generateRangeSchedule(
      data,
      options(data, { endDate: "2027-11-13" }),
    );
    expect(next.shifts).toHaveLength(365);
    expect(next.shifts.at(-1)!.date).toBe("2027-11-13");
    for (const s of next.shifts) {
      expect(s.leaders).toHaveLength(1);
      expect(
        s.leaders!.every(
          (id) => data.people.find((p) => p.id === id)?.role === "leader",
        ),
      ).toBe(true);
      expect(
        s.primary
          .filter((id) => !s.leaders!.includes(id))
          .every(
            (id) => data.people.find((p) => p.id === id)?.role === "companion",
          ),
      ).toBe(true);
      expect(
        s.reserve.every(
          (id) => data.people.find((p) => p.id === id)?.role === "reserve",
        ),
      ).toBe(true);
      expect(new Set([...s.primary, ...s.reserve]).size).toBe(4);
    }
    for (const role of ["leader", "companion"] as const) {
      const counts = data.people
        .filter((p) => p.role === role)
        .map((p) => next.shifts.filter((s) => s.primary.includes(p.id)).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
    expect(
      validateBackup(JSON.parse(JSON.stringify(next))).shifts,
    ).toHaveLength(365);
  }, 15000);
  it("retains every earlier plan and refuses to overwrite an existing duty even without attendance", () => {
    const data = fixture();
    const first = generateRangeSchedule(data, options(data));
    const before = structuredClone(first);
    expect(() => generateRangeSchedule(first, options(data))).toThrow(
      "سوابق حفظ",
    );
    expect(first).toEqual(before);
    const next = generateRangeSchedule(
      first,
      options(data, { startDate: "2027-01-01", endDate: "2027-01-02" }),
    );
    expect(next.shifts[0]).toEqual(first.shifts[0]);
    expect(next.plans).toHaveLength(2);
  });
  it("honors the selected staff and reports insufficient role-specific capacity", () => {
    const data = fixture();
    const ids = ["1", "17", "33", "34"];
    const next = generateRangeSchedule(data, options(data, { peopleIds: ids }));
    expect(
      [...next.shifts[0].primary, ...next.shifts[0].reserve].sort(),
    ).toEqual(ids.sort());
    expect(() =>
      generateRangeSchedule(
        data,
        options(data, { peopleIds: ["17", "33", "34"] }),
      ),
    ).toThrow("مسئول شب");
    expect(() => rangeDates("2026-02-30", "2026-03-02")).toThrow();
    expect(() => rangeDates("2027-01-01", "2026-01-01")).toThrow("پایان");
  });
});

describe("hourly duties, manual edits and confirmed reserve service", () => {
  it("rotates a manually assigned reserve only when their actual presence is confirmed", () => {
    const data = fixture();
    const planned = generateRangeSchedule(data, options(data));
    const shift = planned.shifts[0],
      id = shift.reserve[0];
    const manual = editShift(
      planned,
      shiftKey(shift),
      {
        primary: [id, shift.primary[1]],
        leaders: [id],
        reserve: shift.reserve.slice(1),
      },
      "جایگزین مسئول شب",
    );
    expect(manual.reserveQueues).toEqual(planned.reserveQueues);
    const confirmed = recordAttendance(
      manual,
      shiftKey(shift),
      id,
      "present",
      "خدمت تأیید شد",
    );
    expect(confirmed.reserveQueues![shift.listId!].at(-1)).toBe(id);
    expect(validateBackup(confirmed)).toEqual(confirmed);
  });
  it("independently saves attendance and swaps in two slots on one day", () => {
    const data = fixture();
    const next = generateRangeSchedule(
      data,
      options(data, {
        times: [
          { startTime: "08:00", endTime: "12:00" },
          { startTime: "12:00", endTime: "16:00" },
        ],
      }),
    );
    const [first, second] = next.shifts;
    const confirmed = recordAttendance(
      next,
      shiftKey(second),
      second.primary[0],
      "excused",
      "جایگزین مسئول",
      second.reserve[0],
    );
    expect(confirmed.shifts[0]).toEqual(first);
    expect(confirmed.shifts[1].attendance[0].replacementId).toBe(
      second.reserve[0],
    );
    const swapped = applySwap(confirmed, {
      firstDate: shiftKey(first),
      secondDate: shiftKey(first),
      firstId: first.primary[0],
      secondId: first.reserve[0],
      note: "نوبت صبح",
    });
    expect(swapped.shifts[0].leaders).toContain(first.reserve[0]);
    expect(swapped.shifts[1]).toEqual(confirmed.shifts[1]);
    expect(swapped.swaps[0].firstShiftId).toBe(shiftKey(first));
    expect(validateBackup(swapped)).toEqual(swapped);
  });
  it("supports overnight duties and rejects overlap within a plan or against saved neighboring days", () => {
    const data = fixture();
    const next = generateRangeSchedule(
      data,
      options(data, { times: [{ startTime: "22:00", endTime: "06:00" }] }),
    );
    expect(() =>
      generateRangeSchedule(
        next,
        options(data, {
          startDate: "2026-11-15",
          endDate: "2026-11-15",
          times: [{ startTime: "05:00", endTime: "08:00" }],
        }),
      ),
    ).toThrow("برنامه‌ای");
    expect(() =>
      generateRangeSchedule(
        data,
        options(data, {
          times: [
            { startTime: "22:00", endTime: "06:00" },
            { startTime: "23:00", endTime: "07:00" },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      generateRangeSchedule(
        data,
        options(data, { times: [{ startTime: "08:00", endTime: "08:00" }] }),
      ),
    ).toThrow("متفاوت");
    expect(() =>
      generateRangeSchedule(
        next,
        options(data, {
          startDate: "2026-11-13",
          endDate: "2026-11-13",
          times: [{ startTime: "23:00", endTime: "23:00" }],
        }),
      ),
    ).toThrow();
  });
  it("audits direct role edits and capacity changes while retaining the old roster", () => {
    const data = fixture();
    const planned = generateRangeSchedule(data, options(data));
    const s = planned.shifts[0];
    const next = editShift(
      planned,
      shiftKey(s),
      { primary: ["2", "18", "19"], leaders: ["2"], reserve: ["35"] },
      "شیفت اضافه با تصمیم کاربر",
    );
    expect(next.shifts[0].primary).toHaveLength(3);
    expect(next.shiftChanges![0].previous).toEqual(s);
    expect(next.shiftChanges![0].next.reserve).toEqual(["35"]);
    expect(next.shiftChanges![0].note).toContain("شیفت اضافه");
    expect(validateBackup(next)).toEqual(next);
    expect(planned.shiftChanges).toBeUndefined();
    expect(() =>
      editShift(
        next,
        shiftKey(s),
        { primary: ["2"], leaders: ["2"], reserve: ["2"] },
        "",
      ),
    ).toThrow("متفاوت");
  });
  it("allows an intentional repeated manual duty with a reason and explicit rest override", () => {
    const data = fixture();
    data.settings.minRestDays = 1;
    const next = generateRangeSchedule(
      data,
      options(data, { endDate: "2026-11-15" }),
    );
    const id = next.shifts[0].primary[0],
      target = next.shifts[1];
    const roster = { primary: [id], leaders: [id], reserve: [] };
    expect(() =>
      editShift(next, shiftKey(target), roster, "شیفت اضافه"),
    ).toThrow("تأیید");
    expect(() => editShift(next, shiftKey(target), roster, "", true)).toThrow(
      "توضیح",
    );
    const edited = editShift(
      next,
      shiftKey(target),
      roster,
      "شیفت اضافه",
      true,
    );
    expect(edited.shiftChanges![0].restOverride).toBe(true);
    expect(personStats(id, edited.shifts, edited).total).toBe(2);
  });
  it("only moves a confirmed replacement to the end and preserves that order through backup", () => {
    const data = fixture();
    const planned = generateRangeSchedule(data, options(data));
    const shift = planned.shifts[0],
      id = shift.reserve[0];
    const before = reserveQueue(planned, shift.listId);
    const confirmed = recordAttendance(
      planned,
      shiftKey(shift),
      shift.primary[0],
      "excused",
      "واقعاً خدمت کرد",
      id,
    );
    expect(confirmed.reserveQueues![shift.listId!].at(-1)).toBe(id);
    expect(confirmed.reserveQueues![shift.listId!].slice(0, -1)).toEqual(
      before.filter((value) => value !== id),
    );
    expect(reserveQueue(planned, shift.listId)).toEqual(before);
    expect(
      recordAttendance(
        confirmed,
        shiftKey(shift),
        shift.primary[0],
        "excused",
        "اصلاح توضیح",
        id,
      ).reserveQueues,
    ).toEqual(confirmed.reserveQueues);
    expect(
      validateBackup(JSON.parse(JSON.stringify(confirmed))).reserveQueues,
    ).toEqual(confirmed.reserveQueues);
    expect(() =>
      editShift(
        confirmed,
        shiftKey(shift),
        { primary: ["3", "20"], leaders: ["3"], reserve: [] },
        "",
      ),
    ).toThrow("سوابق");
  });
  it("allows zero or more reserves and keeps a replacement with confirmed attendance", () => {
    const data = fixture();
    const next = generateRangeSchedule(data, options(data));
    const shift = next.shifts[0];
    const noReserves = updateReserves(next, shiftKey(shift), []);
    expect(noReserves.shifts[0].reserve).toEqual([]);
    const more = updateReserves(noReserves, shiftKey(shift), [
      "33",
      "34",
      "35",
    ]);
    expect(validateBackup(more).reserveChanges![0].previousIds).toEqual([]);
  });
  it("rejects malformed new metadata while old backups remain valid", () => {
    const data = fixture();
    expect(validateBackup(data)).toBe(data);
    const next = generateRangeSchedule(data, options(data));
    for (const patch of [
      { reserveQueue: ["missing"] },
      { reminder: { enabled: true, time: "27:00", runAtLogin: false } },
      { plans: [{ ...next.plans![0], shiftIds: ["missing"] }] },
      { shifts: [{ ...next.shifts[0], leaders: ["missing"] }] },
    ])
      expect(() => validateBackup({ ...next, ...patch })).toThrow();
  });
});
