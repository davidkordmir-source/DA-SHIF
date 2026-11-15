import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import type { AppData } from "../src/types";
import { initialData } from "../src/lib/storage";
import { generateSchedule, personStats } from "../src/lib/scheduler";
import { solar, todayKey } from "../src/lib/calendar";
const read = (page: Page) =>
  page.evaluate<AppData>(() =>
    JSON.parse(localStorage.getItem("hamshift:data:v1")!),
  );

test("manual reserve selection outside the generated pair survives reload, backup and Excel export", async ({
  page,
}) => {
  await page.goto("/");
  const before = await read(page),
    shift = before.shifts[0];
  const outside = before.people.find(
    (p) => p.active && ![...shift.primary, ...shift.reserve].includes(p.id),
  )!;
  await page.getByRole("button", { name: "نیروهای رزرو", exact: true }).click();
  await page
    .getByRole("button", { name: "ویرایش رزروهای روز", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("تاریخ رزرو").selectOption(shift.date);
  await expect(
    editor
      .getByLabel("انتخاب نفر رزرو ۱")
      .locator(`option[value="${shift.primary[0]}"]`),
  ).toBeDisabled();
  await editor.getByLabel("جست‌وجو در پرسنل برای رزرو").fill(outside.name);
  await editor.getByLabel("انتخاب نفر رزرو ۱").selectOption(outside.id);
  await editor
    .getByLabel("توضیح تغییر رزرو (اختیاری)")
    .fill("هماهنگی دستی تیم");
  await editor.getByRole("button", { name: "ذخیرهٔ رزروهای روز" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let data = await read(page);
  expect(data.shifts[0].reserve).toEqual([outside.id, shift.reserve[1]]);
  expect(data.reserveChanges?.[0]).toMatchObject({
    date: shift.date,
    previousIds: shift.reserve,
    nextIds: [outside.id, shift.reserve[1]],
    note: "هماهنگی دستی تیم",
  });
  await page.reload();
  await page
    .getByRole("button", { name: "جابه‌جایی شیفت", exact: true })
    .click();
  await expect(page.locator(".reserve-history-record")).toContainText(
    "هماهنگی دستی تیم",
  );
  await expect(page.locator(".reserve-history-record")).toContainText(
    outside.name,
  );
  await expect(page.locator(".reserve-history-record")).toContainText(
    before.people.find((p) => p.id === shift.reserve[0])!.name,
  );
  await page.getByRole("button", { name: "نیروهای رزرو", exact: true }).click();
  const exportReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروجی اکسل", exact: true }).click();
  const excel = await exportReady,
    wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await excel.path())!);
  expect(wb.getWorksheet("جابه‌جایی‌ها")!.getRow(6).getCell(1).text).toBe(
    "تغییر رزرو",
  );
  expect(wb.getWorksheet("جابه‌جایی‌ها")!.getRow(6).getCell(4).text).toContain(
    outside.name,
  );
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  const backupReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "دریافت پشتیبان کامل" }).click();
  const backup = await backupReady,
    backupPath = (await backup.path())!;
  expect(
    JSON.parse(await fs.readFile(backupPath, "utf8")).reserveChanges,
  ).toHaveLength(1);
  await page.locator("input[type=file]").setInputFiles(backupPath);
  await page.getByRole("button", { name: "تأیید جایگزینی و بازیابی" }).click();
  data = await read(page);
  expect(data.reserveChanges).toHaveLength(1);
  expect(data.shifts[0].reserve[0]).toBe(outside.id);
});

test("an absence can use any eligible active person and records the reserve change atomically", async ({
  page,
}) => {
  await page.goto("/");
  const before = await read(page),
    shift = before.shifts[0];
  const outsider = before.people.find(
    (p) =>
      p.active &&
      ![...shift.primary, ...shift.reserve].includes(p.id) &&
      !before.shifts.some(
        (s) =>
          s.date !== shift.date &&
          s.primary.includes(p.id) &&
          Math.abs((Date.parse(s.date) - Date.parse(shift.date)) / 86400000) <=
            before.settings.minRestDays,
      ),
  )!;
  expect(outsider).toBeTruthy();
  await page.getByRole("button", { name: "حضور و غیاب", exact: true }).click();
  await page
    .getByRole("button", { name: "ثبت وضعیت", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByText("غیبت موجه", { exact: true })
    .click();
  await page.getByLabel("انتخاب جایگزین از پرسنل").selectOption(outsider.id);
  await expect(page.getByLabel("جای کدام رزرو قرار بگیرد؟")).toBeVisible();
  await page
    .getByLabel("جای کدام رزرو قرار بگیرد؟")
    .selectOption(shift.reserve[0]);
  await page.getByLabel("توضیحات (اختیاری)").fill("فرد انتخابی مدیر");
  await page.getByRole("button", { name: "ذخیرهٔ وضعیت" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const data = await read(page);
  expect(data.shifts[0].primary).toEqual(shift.primary);
  expect(data.shifts[0].reserve).toEqual([outsider.id, shift.reserve[1]]);
  expect(data.shifts[0].attendance[0]).toMatchObject({
    personId: shift.primary[0],
    status: "excused",
    replacementId: outsider.id,
  });
  expect(data.reserveChanges?.[0].source).toBe("attendance");
  await page.getByRole("button", { name: "نیروهای رزرو", exact: true }).click();
  await page
    .getByRole("button", { name: "ویرایش رزروهای روز", exact: true })
    .click();
  await page.getByLabel("تاریخ رزرو").selectOption(shift.date);
  await expect(page.getByLabel("انتخاب نفر رزرو ۱")).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("حضور جایگزین ثبت‌شده");
});

test("the fairness report shows the prior month actually used for scheduling", async ({
  page,
}) => {
  const data = initialData();
  data.demo = false;
  data.shifts = [];
  const j = solar(todayKey());
  let pm = j.jm - 1,
    py = j.jy;
  if (pm === 0) {
    pm = 12;
    py--;
  }
  data.shifts = generateSchedule(data, py, pm).shifts;
  const previous = structuredClone(data.shifts);
  data.shifts = generateSchedule(data, j.jy, j.jm).shifts;
  await page.addInitScript(
    (value) => localStorage.setItem("hamshift:data:v1", value),
    JSON.stringify(data),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "گزارش‌ها و عدالت", exact: true })
    .click();
  await expect(page.getByText(/سابقهٔ پیش از این ماه: ۱ ماه/)).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "تعطیل قبلی", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "جمعه قبلی", exact: true }),
  ).toBeVisible();
  const stats = personStats(data.people[0].id, previous, data),
    row = page.locator(".report-table tbody tr").first();
  const digits = (n: number) =>
    String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
  await expect(row.locator("td").nth(1)).toHaveText(
    digits(stats.workloadHoliday),
  );
  await expect(row.locator("td").nth(2)).toHaveText(
    digits(stats.workloadFriday),
  );
});
