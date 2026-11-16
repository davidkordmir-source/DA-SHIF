import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { initialData } from "../src/lib/storage";
const emptyData = () => ({
  ...initialData(),
  demo: false,
  people: [],
  shifts: [],
});

test("three personnel sheets import separately and categories survive reload", async ({
  page,
}) => {
  const data = { ...emptyData(), demo: false };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("hamshift:data:v1"))
      localStorage.setItem("hamshift:data:v1", JSON.stringify(data));
  }, data);
  const wb = new ExcelJS.Workbook();
  for (const [index, label] of ["مسئول شب", "همراه", "رزرو"].entries())
    wb.addWorksheet(label).addRows([
      ["کد پرسنلی", "نام و نام خانوادگی"],
      [String(9001 + index), `عضو ${index + 1}`],
    ]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await page.goto("/");
  await page.getByRole("button", { name: /^پرسنل/ }).click();
  for (const label of ["مسئول شب", "همراه", "رزرو"]) {
    await page
      .getByRole("button", { name: "ورود از اکسل", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await modal
      .locator("input[type=file]")
      .setInputFiles({
        name: "team.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer,
      });
    await modal.getByLabel("شیت اکسل", { exact: true }).selectOption(label);
    await expect(modal.locator("tbody")).toContainText(label);
    await modal.getByRole("button", { name: /تأیید ورود/ }).click();
    await expect(modal).toHaveCount(0);
  }
  await page.reload();
  await page.getByRole("button", { name: /^پرسنل/ }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hamshift:data:v1")!),
  );
  expect(saved.people.map((p: { category: string }) => p.category)).toEqual([
    "night-lead",
    "companion",
    "reserve",
  ]);
  await page.locator(".category-night-lead").click();
  await expect(page.locator(".people-panel tbody tr")).toHaveCount(1);
  await expect(page.locator(".people-panel tbody")).toContainText("عضو 1");
  await page.getByLabel("دستهٔ عضو 1").selectOption("companion");
  await expect(page.locator(".people-panel tbody tr")).toHaveCount(0);
  await page.locator(".category-companion").click();
  await expect(page.locator(".people-panel tbody tr")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".people-categories")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("person deletion requires confirmation, preserves history, and survives a failed save", async ({
  page,
}) => {
  const data = { ...initialData(), demo: false };
  data.people.push({
    id: "unused",
    name: "پرسنل اضافی",
    department: "",
    active: true,
    reserveOnly: false,
  });
  await page.addInitScript((data) => {
    if (!localStorage.getItem("hamshift:data:v1"))
      localStorage.setItem("hamshift:data:v1", JSON.stringify(data));
  }, data);
  await page.goto("/");
  await page.getByRole("button", { name: /^پرسنل/ }).click();
  await page
    .getByRole("button", {
      name: `حذف ${data.people.find((p) => p.id === data.shifts[0].primary[0])!.name}`,
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("سوابق ثبت‌شده");
  await expect(
    page.getByRole("button", { name: "حذف دائمی پرسنل" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "انصراف", exact: true }).click();
  await page
    .getByRole("button", { name: "حذف پرسنل اضافی", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "حذف دائمی پرسنل" }),
  ).toBeDisabled();
  await page.getByLabel("نام کامل فرد برای تأیید حذف").fill("پرسنل اضافی");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "hamshift:data:v1") throw new Error("ذخیره آزمایشی ناموفق");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "حذف دائمی پرسنل" }).click();
  await expect(page.getByRole("dialog")).toContainText("ذخیره آزمایشی ناموفق");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hamshift:data:v1")!).people.some(
        (p: { id: string }) => p.id === "unused",
      ),
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /^پرسنل/ }).click();
  await page
    .getByRole("button", { name: "حذف پرسنل اضافی", exact: true })
    .click();
  await page.getByLabel("نام کامل فرد برای تأیید حذف").fill("پرسنل اضافی");
  await page.getByRole("button", { name: "حذف دائمی پرسنل" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "حذف پرسنل اضافی", exact: true }),
  ).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hamshift:data:v1")!),
  );
  expect(saved.shifts).toEqual(data.shifts);
  expect(saved.people).toHaveLength(data.people.length - 1);
});
