import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import type { AppData, Person, PersonnelCategory } from "../src/types";
import { solar, solarLabel } from "../src/lib/calendar";

const member = (
  id: string,
  name: string,
  category: PersonnelCategory,
): Person => ({
  id,
  name,
  category,
  active: true,
  reserveOnly: category === "reserve",
  department: "عملیات",
});
const leads = [
  member("90", "مسئول نود", "night-lead"),
  member("2", "مسئول دو", "night-lead"),
  member("51", "مسئول پنجاه", "night-lead"),
];
const companions = [
  member("C8", "همراه هشت", "companion"),
  member("C1", "همراه یک", "companion"),
];
const reserves = [
  member("R9", "رزرو نه", "reserve"),
  member("R1", "رزرو یک", "reserve"),
  member("R7", "رزرو هفت", "reserve"),
];
const fixture = (people: Person[]): AppData => ({
  version: 1,
  demo: false,
  people,
  shifts: [],
  swaps: [],
  events: [{ date: "2026-11-02", title: "تعطیل تست", holiday: true }],
  settings: {
    primaryCount: 2,
    reserveCount: 2,
    minRestDays: 0,
    hijriOffset: 0,
  },
});
const read = (page: Page) =>
  page.evaluate<AppData>(() =>
    JSON.parse(localStorage.getItem("hamshift:data:v1")!),
  );
async function seed(page: Page, data: AppData) {
  await page.goto("/");
  await page.evaluate(
    (data) => localStorage.setItem("hamshift:data:v1", JSON.stringify(data)),
    data,
  );
  await page.reload();
}
async function pick(page: Page, label: string, date: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const picker = page.getByRole("group", {
    name: `تقویم ${label}`,
    exact: true,
  });
  const j = solar(date);
  await picker.getByLabel("سال تقویم").selectOption(String(j.jy));
  await picker.getByLabel("ماه تقویم").selectOption(String(j.jm));
  await picker
    .getByRole("button", { name: solarLabel(date, true), exact: true })
    .click();
}
async function dates(page: Page) {
  await pick(page, "تاریخ شروع برنامه", "2026-11-01");
  await pick(page, "تاریخ پایان برنامه", "2026-11-05");
}
async function importSheet(page: Page, buffer: Buffer, sheetName: string) {
  await page
    .getByRole("button", { name: "ورود پرسنل از اکسل", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.locator("input[type=file]").setInputFiles({
    name: "rosters.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await modal.getByLabel("شیت اکسل", { exact: true }).selectOption(sheetName);
  await expect(modal.getByRole("button", { name: /تأیید ورود/ })).toBeEnabled();
  await modal.getByRole("button", { name: /تأیید ورود/ }).click();
  await expect(
    page.getByRole("dialog", { name: "ایجاد برنامهٔ عادلانه" }),
  ).toBeVisible();
}

test("without a companion roster the wizard creates one-person shifts and never fills companion slots from night leads", async ({
  page,
}) => {
  await seed(page, fixture([...leads, ...reserves]));
  await page
    .getByRole("button", { name: "ایجاد برنامهٔ عادلانه", exact: true })
    .click();
  await dates(page);
  await page
    .getByRole("button", { name: "ادامه: انتخاب همراه", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "انتخاب همراه", exact: true }),
  ).toBeVisible();
  expect((await read(page)).shifts).toEqual([]);
  await page
    .getByRole("button", { name: "ادامه: رزرو و تأیید", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "مشخص کنید فهرست همراه دارید یا خیر",
  );
  await page.getByRole("radio", { name: /بله، فهرست همراه دارم/ }).check();
  await page
    .getByRole("button", { name: "ادامه: رزرو و تأیید", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "فهرست همراه را وارد و حداقل یک نفر انتخاب کنید",
  );
  await page.getByRole("radio", { name: /خیر، شیفت یک‌نفره/ }).check();
  await page
    .getByRole("button", { name: "ادامه: رزرو و تأیید", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ساخت برنامهٔ انتخاب‌شده", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const data = await read(page);
  expect(data.shifts.map((s) => s.primary)).toEqual([
    ["90"],
    ["2"],
    ["51"],
    ["90"],
    ["2"],
  ]);
  expect(
    data.shifts.every(
      (s) => s.primaryRoles?.join() === "night-lead" && s.reserve.length === 2,
    ),
  ).toBe(true);
  expect(
    data.shifts.every((s) => s.reserve.every((id) => id.startsWith("R"))),
  ).toBe(true);
});

test("three separate worksheets supply three independent ordered queues and retain role labels in Excel and backups", async ({
  page,
}) => {
  await seed(page, fixture([]));
  const wb = new ExcelJS.Workbook();
  for (const [name, roster] of [
    ["مسئول شب", leads],
    ["همراه", companions],
    ["رزرو", reserves],
  ] as const) {
    const sheet = wb.addWorksheet(name);
    sheet.addRow(["کد پرسنلی", "نام و نام خانوادگی", "واحد"]);
    roster.forEach((p) => sheet.addRow([p.id, p.name, p.department]));
  }
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await page
    .getByRole("button", { name: "ایجاد برنامهٔ عادلانه", exact: true })
    .click();
  await dates(page);
  await importSheet(page, buffer, "مسئول شب");
  await page
    .getByRole("button", { name: "ادامه: انتخاب همراه", exact: true })
    .click();
  await page.getByRole("radio", { name: /بله، فهرست همراه دارم/ }).check();
  await importSheet(page, buffer, "همراه");
  await page
    .getByRole("button", { name: "ادامه: رزرو و تأیید", exact: true })
    .click();
  await importSheet(page, buffer, "رزرو");
  await expect(page.getByLabel("تعداد رزرو این برنامه در روز")).toHaveValue(
    "2",
  );
  await page
    .getByRole("button", { name: "ساخت برنامهٔ انتخاب‌شده", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await read(page);
  expect(saved.shifts.map((s) => s.primary)).toEqual([
    ["90", "C8"],
    ["2", "C1"],
    ["51", "C8"],
    ["90", "C1"],
    ["2", "C8"],
  ]);
  expect(saved.shifts.slice(0, 3).map((s) => s.reserve)).toEqual([
    ["R9", "R1"],
    ["R7", "R9"],
    ["R1", "R7"],
  ]);
  await page.reload();
  expect(await read(page)).toEqual(saved);
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروجی اکسل", exact: true }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await exported).path())!);
  const scheduleSheet = workbook.getWorksheet("برنامه شیفت")!;
  let exportedFirstDay = "";
  scheduleSheet.eachRow((row) => {
    if (row.getCell(2).text === "2026-11-01")
      exportedFirstDay = row.getCell(5).text;
  });
  expect(exportedFirstDay).toBe("مسئول شب: مسئول نود، همراه: همراه هشت");
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  const backupReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "دریافت پشتیبان کامل" }).click();
  const path = (await (await backupReady).path())!;
  await page.locator("input[type=file]").setInputFiles(path);
  await page
    .getByRole("button", { name: "تأیید جایگزینی و بازیابی", exact: true })
    .click();
  expect(await read(page)).toEqual(saved);
});

test("reimported existing IDs follow the new file order; declining existing companions keeps shifts single-person", async ({
  page,
}) => {
  await seed(page, fixture([...leads, ...companions]));
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("مسئول شب").addRows([
    ["کد پرسنلی", "نام و نام خانوادگی"],
    ["51", "مسئول پنجاه"],
    ["90", "مسئول نود"],
    ["2", "مسئول دو"],
  ]);
  await page.getByRole("button", { name: /^پرسنل/ }).click();
  await page.getByRole("button", { name: "ورود از اکسل", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "new-order.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    });
  await page.getByRole("button", { name: /تأیید ورود/ }).click();
  await page.locator(".category-night-lead").click();
  await expect(
    page.locator(".people-panel tbody .person-cell strong"),
  ).toHaveText(["مسئول پنجاه", "مسئول نود", "مسئول دو"]);
  await page
    .getByRole("button", { name: "برنامهٔ شیفت‌ها", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ایجاد برنامهٔ عادلانه", exact: true })
    .click();
  await dates(page);
  await page
    .getByRole("button", { name: "ادامه: انتخاب همراه", exact: true })
    .click();
  await page.getByRole("radio", { name: /خیر، شیفت یک‌نفره/ }).check();
  await page
    .getByRole("button", { name: "ادامه: رزرو و تأیید", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ساخت برنامهٔ انتخاب‌شده", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await read(page);
  expect(saved.shifts.map((s) => s.primary)).toEqual([
    ["51"],
    ["90"],
    ["2"],
    ["51"],
    ["90"],
  ]);
  expect(saved.people.filter((p) => p.category === "companion")).toHaveLength(
    2,
  );
});
