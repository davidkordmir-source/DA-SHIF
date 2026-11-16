import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  deletePerson,
  personnelCategory,
  personDeletionBlocker,
} from "./people";
import { initialData, validateBackup } from "./storage";
import { readPeople } from "./excel";
import type { Person, PersonnelCategory } from "../types";
const emptyData = () => ({
  ...initialData(),
  demo: false,
  people: [],
  shifts: [],
});

const person: Person = {
  id: "new",
  name: "عضو تازه",
  department: "عملیات",
  active: true,
  reserveOnly: false,
};

describe("personnel categories and deletion", () => {
  it("keeps old backups and their reserve flag compatible", () => {
    const old = initialData();
    expect(validateBackup(old)).toEqual(old);
    expect(personnelCategory(person)).toBe("companion");
    expect(personnelCategory({ ...person, reserveOnly: true })).toBe("reserve");
    for (const category of [
      "night-lead",
      "companion",
      "reserve",
    ] as PersonnelCategory[]) {
      const data = {
        ...emptyData(),
        people: [{ ...person, category, reserveOnly: category === "reserve" }],
      };
      expect(validateBackup(data).people[0].category).toBe(category);
    }
    expect(() =>
      validateBackup({
        ...emptyData(),
        people: [{ ...person, category: "reserve" }],
      }),
    ).toThrow();
    expect(() =>
      validateBackup({
        ...emptyData(),
        people: [{ ...person, category: "invalid" }],
      }),
    ).toThrow();
  });

  it("deletes only the confirmed unused person without mutating the original", () => {
    const data = { ...initialData(), demo: false };
    data.people.push(person);
    expect(() => deletePerson(data, person.id, "اشتباه")).toThrow("نام کامل");
    const next = deletePerson(data, person.id, person.name);
    expect(next.people).not.toContainEqual(person);
    expect(data.people).toContainEqual(person);
    expect(next.shifts).toEqual(data.shifts);
    expect(validateBackup(next)).toEqual(next);
  });

  it("protects primary, reserve, replacement, list and historical references", () => {
    const base = { ...emptyData(), people: [person] };
    const shift = {
      date: "2026-11-16",
      primary: [],
      reserve: [],
      attendance: [],
    };
    const variants = [
      { ...base, shifts: [{ ...shift, primary: [person.id] }] },
      { ...base, shifts: [{ ...shift, reserve: [person.id] }] },
      {
        ...base,
        shifts: [
          {
            ...shift,
            attendance: [
              {
                personId: "other",
                status: "excused" as const,
                note: "",
                replacementId: person.id,
              },
            ],
          },
        ],
      },
      {
        ...base,
        schedules: [
          {
            id: "list",
            name: "list",
            startDate: shift.date,
            endDate: shift.date,
            personIds: [person.id],
          },
        ],
      },
      {
        ...base,
        reserveChanges: [
          {
            id: "change",
            date: shift.date,
            createdAt: "2026-11-16T00:00:00Z",
            previousIds: [person.id],
            nextIds: ["other"],
            source: "manual" as const,
            note: "",
          },
        ],
      },
      {
        ...base,
        swaps: [
          {
            id: "swap",
            firstId: person.id,
            secondId: "other",
            firstDate: shift.date,
            secondDate: "2026-11-17",
            createdAt: "2026-11-16T00:00:00Z",
            note: "",
          },
        ],
      },
    ];
    for (const data of variants) {
      expect(personDeletionBlocker(data, person.id)).toContain("سوابق");
      expect(() => deletePerson(data, person.id, person.name)).toThrow("سوابق");
    }
  });
});

it("imports independent worksheets and explicit categories without losing legacy reserve imports", async () => {
  const wb = new ExcelJS.Workbook();
  for (const [index, name] of ["مسئول شب", "همراه", "رزرو"].entries()) {
    const sheet = wb.addWorksheet(name);
    sheet.addRows([
      ["کد پرسنلی", "نام و نام خانوادگی", "واحد"],
      [String(index + 1), `عضو ${index + 1}`, "عملیات"],
    ]);
  }
  wb.addWorksheet("خالی");
  const legacy = wb.addWorksheet("قدیمی");
  legacy.addRows([
    ["کد", "نام", "فقط رزرو"],
    ["9", "نیروی قدیمی", "بله"],
  ]);
  const file = new File(
    [(await wb.xlsx.writeBuffer()) as ArrayBuffer],
    "team.xlsx",
  );
  for (const [sheetName, category] of [
    ["مسئول شب", "night-lead"],
    ["همراه", "companion"],
    ["رزرو", "reserve"],
  ] as const) {
    const result = await readPeople(file, { sheetName });
    expect(result.people).toHaveLength(1);
    expect(result.people[0].category).toBe(category);
    expect(result.people[0].reserveOnly).toBe(category === "reserve");
    expect(result.sheetNames).toHaveLength(5);
  }
  const explicit = await readPeople(file, {
    sheetName: "همراه",
    category: "reserve",
  });
  expect(explicit.people[0]).toMatchObject({
    category: "reserve",
    reserveOnly: true,
  });
  expect(
    (await readPeople(file, { sheetName: "قدیمی" })).people[0].reserveOnly,
  ).toBe(true);
  const empty = await readPeople(file, { sheetName: "خالی" });
  expect(empty.errors).toHaveLength(1);
  expect(empty.sheetNames).toHaveLength(5);
});
