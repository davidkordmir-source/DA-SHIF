import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs/promises";
import type { AppData } from "../src/types";

const getData = (page: import("@playwright/test").Page) =>
  page.evaluate<AppData>(() =>
    JSON.parse(localStorage.getItem("hamshift:data:v1")!),
  );
test("calendar, mobile navigation, profile, and data survive reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "برنامهٔ شیفت‌ها." }),
  ).toBeVisible();
  const data = await getData(page);
  expect(data.settings.primaryCount).toBe(2);
  expect(data.settings.reserveCount).toBe(2);
  await expect(page.getByRole("gridcell")).toHaveCount(data.shifts.length);
  await page.getByRole("gridcell").first().click();
  await expect(page.getByRole("dialog")).toContainText("نیروهای رزرو");
  await expect(page.getByRole("dialog")).toContainText("میلادی");
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await page.getByRole("button", { name: /^پرسنل/ }).click();
  await page
    .getByRole("button", { name: new RegExp(data.people[0].name) })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("غیبت غیرموجه");
  await page.keyboard.press("Escape");
  await page.reload();
  expect((await getData(page)).people).toEqual(data.people);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "باز کردن منو" }).click();
  await page.getByRole("button", { name: "نیروهای رزرو", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "نیروهای رزرو." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("Excel import, generation, export, attendance, swaps, and backup work", async ({
  page,
}) => {
  await page.goto("/");
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("پرسنل");
  sheet.addRow(["کد پرسنلی", "نام و نام خانوادگی", "واحد", "فقط رزرو"]);
  for (let i = 0; i < 12; i++)
    sheet.addRow([String(2001 + i), `همکار آزمایشی ${i + 1}`, "عملیات", "خیر"]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await page.getByRole("button", { name: "ورود پرسنل از اکسل" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "team.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expect(page.getByRole("dialog")).toContainText("پیش‌نمایش پرسنل");
  await page.getByRole("button", { name: /تأیید ورود/ }).click();
  expect((await getData(page)).people).toHaveLength(12);
  expect((await getData(page)).shifts).toHaveLength(0);
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page.getByLabel("حداقل روز استراحت بین دو شیفت").fill("0");
  await page.getByRole("button", { name: "ذخیرهٔ تنظیمات" }).click();
  await page
    .getByRole("button", { name: "برنامهٔ شیفت‌ها", exact: true })
    .click();
  await page.getByRole("button", { name: "ایجاد برنامهٔ عادلانه" }).click();
  await page.getByRole("button", { name: /ساخت برنامهٔ/ }).click();
  const generated = await getData(page);
  expect(generated.shifts.length).toBeGreaterThan(27);
  expect(
    generated.shifts.every(
      (s) => s.primary.length === 2 && s.reserve.length === 2,
    ),
  ).toBe(true);
  const [date] = generated.shifts;
  await page
    .getByRole("button", { name: "جابه‌جایی شیفت", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ثبت جابه‌جایی", exact: true })
    .first()
    .click();
  await page.getByLabel("تاریخ شیفت اول").selectOption(date.date);
  await page.getByLabel("تاریخ شیفت دوم").selectOption(date.date);
  await page
    .getByLabel("نیروی اصلی", { exact: true })
    .selectOption(date.primary[0]);
  await page.getByLabel("نیروی رزرو همین روز").selectOption(date.reserve[0]);
  await page.getByLabel("توضیح جابه‌جایی (اختیاری)").fill("توافق همکاران");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ثبت جابه‌جایی", exact: true })
    .click();
  await expect(page.getByText("توافق همکاران")).toBeVisible();
  const swapped = await getData(page);
  expect(swapped.swaps).toHaveLength(1);
  expect(swapped.shifts[0].primary).toContain(date.reserve[0]);
  await page.getByRole("button", { name: "حضور و غیاب", exact: true }).click();
  await page
    .getByRole("button", { name: "ثبت وضعیت", exact: true })
    .first()
    .click();
  await page.getByText("غیبت موجه", { exact: true }).click();
  await page
    .getByLabel("انتخاب جایگزین از پرسنل")
    .selectOption(swapped.shifts[0].reserve[0]);
  await page.getByLabel("توضیحات (اختیاری)").fill("مرخصی پزشکی");
  await page.getByRole("button", { name: "ذخیرهٔ وضعیت" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await getData(page)).shifts[0].attendance[0]).toMatchObject({
    status: "excused",
    note: "مرخصی پزشکی",
    replacementId: swapped.shifts[0].reserve[0],
  });
  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروجی اکسل", exact: true }).click();
  const excel = await excelDownload;
  const downloadedWorkbook = new ExcelJS.Workbook();
  await downloadedWorkbook.xlsx.readFile((await excel.path())!);
  expect(downloadedWorkbook.worksheets.map((s) => s.name)).toEqual([
    "برنامه شیفت",
    "گزارش عدالت",
    "جابه‌جایی‌ها",
  ]);
  expect(downloadedWorkbook.worksheets[0].getRow(2).getCell(8).text).toContain(
    "غیبت موجه",
  );
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "دریافت پشتیبان کامل" }).click();
  const saved = await backupDownload;
  await page.locator("input[type=file]").setInputFiles((await saved.path())!);
  await expect(page.getByRole("dialog")).toContainText("بازیابی نسخهٔ پشتیبان");
  await page.getByRole("button", { name: "تأیید جایگزینی و بازیابی" }).click();
  expect((await getData(page)).swaps).toHaveLength(1);
  expect((await getData(page)).shifts[0].attendance[0].status).toBe("excused");
});

test("the standalone HTML has no network dependencies and works offline", async ({
  browser,
}) => {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const html = await fs.readFile(path.resolve("dist/index.html"), "utf8");
  // Managed Chromium blocks file:// by enterprise policy. Serve the actual
  // standalone artifact from memory, while the browser is completely offline.
  await context.route("http://127.0.0.1:4173/offline.html", (route) =>
    route.fulfill({ body: html, contentType: "text/html" }),
  );
  page.on("request", (r) => {
    if (
      r.url() !== "http://127.0.0.1:4173/offline.html" &&
      /^https?:/.test(r.url())
    )
      remoteRequests.push(r.url());
  });
  await page.goto("http://127.0.0.1:4173/offline.html");
  await expect(
    page.getByRole("heading", { name: "برنامهٔ شیفت‌ها." }),
  ).toBeVisible();
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  await page.getByRole("gridcell").first().click();
  await expect(page.getByRole("dialog")).toContainText("میلادی");
  await expect(page.getByRole("dialog")).toContainText("قمری");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^پرسنل/ }).click();
  await expect(page.getByRole("heading", { name: "پرسنل." })).toBeVisible();
  await page.reload();
  expect((await getData(page)).people).toHaveLength(16);
  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
