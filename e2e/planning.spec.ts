import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import type { AppData } from "../src/types";
import { shiftKey } from "../src/lib/shift-utils";

const getData = (page: Page) =>
  page.evaluate<AppData>(() =>
    JSON.parse(localStorage.getItem("hamshift:data:v1")!),
  );
async function openPlanner(page: Page) {
  await page
    .getByRole("button", { name: "برنامهٔ شیفت‌ها", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ایجاد برنامهٔ عادلانه", exact: true })
    .click();
}
async function importTeam(page: Page, separateFiles = false) {
  const groups = [
    ["مسئول شب", 12],
    ["همراه", 20],
    ["رزرو", 8],
  ] as const;
  const workbook = new ExcelJS.Workbook();
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  let id = 100;
  for (const [role, count] of groups) {
    const wb = separateFiles ? new ExcelJS.Workbook() : workbook;
    const sheet = wb.addWorksheet(role);
    sheet.addRow(["کد پرسنلی", "نام و نام خانوادگی", "واحد", "شماره تلفن"]);
    for (let i = 0; i < count; i++)
      sheet.addRow([
        String(++id),
        `${role} ${i + 1}`,
        "عملیات",
        `0912000${String(id).padStart(4, "0")}`,
      ]);
    if (separateFiles)
      files.push({
        name: `${role}.xlsx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(await wb.xlsx.writeBuffer()),
      });
  }
  if (!separateFiles)
    files.push({
      name: "team.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
  await page
    .getByRole("button", { name: "ورود پرسنل از اکسل", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles(files);
  await expect(page.getByRole("dialog")).toContainText("۴۰ نفر");
  await page.getByRole("button", { name: /تأیید ورود/ }).click();
}

test("importing staff after manual edits preserves the existing person and saved duties", async ({
  page,
}) => {
  await page.goto("/");
  const before = await getData(page);
  await page.getByRole("button", { name: /^پرسنل/ }).click();
  await page.getByRole("button", { name: "افزودن پرسنل", exact: true }).click();
  await page
    .getByLabel("نام و نام خانوادگی", { exact: true })
    .fill("همکار ثبت‌شده دستی");
  await page.getByLabel("کد پرسنلی", { exact: true }).fill("9000");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "افزودن پرسنل", exact: true })
    .click();
  await page
    .getByRole("button", { name: "برنامهٔ شیفت‌ها", exact: true })
    .click();
  await importTeam(page);
  const after = await getData(page);
  expect(after.people.find((p) => p.id === "9000")?.name).toBe(
    "همکار ثبت‌شده دستی",
  );
  expect(after.shifts).toEqual(before.shifts);
});

test("three role sheets, a ten-person single day, a 365-day plan, direct edits, confirmed replacement and backup retain all history", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await importTeam(page);
  const team = await getData(page);
  expect(team.people.filter((p) => p.role === "leader")).toHaveLength(12);
  expect(team.people.filter((p) => p.role === "companion")).toHaveLength(20);
  expect(team.people.filter((p) => p.role === "reserve")).toHaveLength(8);
  expect(team.people[0].phone).toBe("09120000101");
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page.getByLabel("حداقل روز استراحت بین دو شیفت").fill("0");
  await page
    .getByRole("button", { name: "ذخیرهٔ تنظیمات", exact: true })
    .click();
  await openPlanner(page);
  await page.getByLabel("نام برنامه (اختیاری)").fill("شیفت ویژه ده نفر");
  await page.getByLabel("تاریخ شروع شمسی", { exact: true }).fill("1405/08/10");
  await page.getByLabel("تعداد روزهای برنامه").fill("1");
  await page.getByLabel("تعداد مسئول شب در هر نوبت").fill("2");
  await page.getByLabel("تعداد همراه در هر نوبت").fill("6");
  await page
    .getByRole("button", { name: "ساخت برنامهٔ بازهٔ انتخابی" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const single = await getData(page);
  expect(single.shifts).toHaveLength(1);
  expect(
    single.shifts[0].primary.length + single.shifts[0].reserve.length,
  ).toBe(10);
  await openPlanner(page);
  await page.getByLabel("نام برنامه (اختیاری)").fill("برنامه سالانه چهل نفر");
  await page.getByLabel("تاریخ شروع شمسی", { exact: true }).fill("1406/01/01");
  await page.getByLabel("تعداد روزهای برنامه").fill("365");
  await page.getByLabel("تعداد رزرو در هر نوبت").fill("3");
  await page
    .getByRole("button", { name: "ساخت برنامهٔ بازهٔ انتخابی" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const annual = await getData(page);
  expect(annual.shifts).toHaveLength(366);
  expect(annual.plans).toHaveLength(2);
  expect(annual.shifts[0]).toEqual(single.shifts[0]);
  expect(annual.plans![0].peopleIds).toHaveLength(40);
  expect(annual.shifts.slice(1).every((s) => s.reserve.length === 3)).toBe(
    true,
  );
  // Edit directly from the day details, with the old roster retained in audit history.
  await page
    .getByRole("button", { name: "جزئیات روز", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "ویرایش نفرات شیفت", exact: true })
    .click();
  const old = annual.shifts[0];
  const replacementLeader = team.people.find(
    (p) => p.role === "leader" && !old.primary.includes(p.id),
  )!;
  await page
    .getByLabel("مسئول شب ۱", { exact: true })
    .selectOption(replacementLeader.id);
  await page.getByLabel("علت ویرایش نفرات").fill("شیفت اضافه به تصمیم کاربر");
  await page.getByRole("button", { name: "ذخیرهٔ نفرات شیفت" }).click();
  const edited = await getData(page);
  expect(edited.shiftChanges![0].previous).toEqual(old);
  expect(edited.shifts[0].leaders).toContain(replacementLeader.id);
  // Confirm real reserve service from the same day drawer.
  await page
    .getByRole("button", { name: "جزئیات روز", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "ثبت وضعیت", exact: true })
    .first()
    .click();
  await page.getByText("غیبت موجه", { exact: true }).click();
  await page.getByLabel("انتخاب جایگزین از پرسنل").selectOption(old.reserve[0]);
  await expect(page.getByRole("dialog")).toContainText("انتهای صف رزرو");
  await page.getByRole("button", { name: "ذخیرهٔ وضعیت" }).click();
  expect((await getData(page)).reserveQueues![old.listId!].at(-1)).toBe(
    old.reserve[0],
  );
  await page.reload();
  expect((await getData(page)).shifts).toHaveLength(366);
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "دریافت پشتیبان کامل" }).click();
  const file = await download;
  await page.locator("input[type=file]").setInputFiles((await file.path())!);
  await page.getByRole("button", { name: "تأیید جایگزینی و بازیابی" }).click();
  expect((await getData(page)).shiftChanges).toHaveLength(1);
  expect((await getData(page)).plans).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("separate Excel files, hourly slots, per-slot editing and phone/reminder preferences survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await importTeam(page, true);
  await page
    .getByRole("button", { name: "ویرایش مشخصات", exact: true })
    .first()
    .click();
  await page.getByLabel("شماره تلفن", { exact: true }).fill("۰۹۱۲۳۴۵۶۷۸۹");
  await page
    .getByRole("button", { name: "ذخیرهٔ مشخصات", exact: true })
    .click();
  expect((await getData(page)).people[0].phone).toBe("09123456789");
  await openPlanner(page);
  await page.getByLabel("نام برنامه (اختیاری)").fill("نوبت‌های ساعتی");
  await page.getByLabel("تاریخ شروع شمسی", { exact: true }).fill("1405/08/10");
  await page.getByLabel("تعداد روزهای برنامه").fill("1");
  await page.getByLabel("تعریف شیفت ساعتی در هر روز").check();
  await page.getByRole("button", { name: "افزودن نوبت ساعتی" }).click();
  await page
    .getByRole("button", { name: "ساخت برنامهٔ بازهٔ انتخابی" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const initial = await getData(page);
  expect(initial.shifts).toHaveLength(2);
  expect(initial.shifts[0].date).toBe(initial.shifts[1].date);
  await page
    .getByRole("button", { name: "جزئیات روز", exact: true })
    .first()
    .click();
  await page
    .getByLabel("نوبت این روز")
    .selectOption(shiftKey(initial.shifts[1]));
  await page
    .getByRole("button", { name: "ویرایش رزروهای روز", exact: true })
    .click();
  await page.getByLabel("تعداد رزرو این نوبت").fill("0");
  await page
    .getByRole("button", { name: "ذخیرهٔ رزروهای روز", exact: true })
    .click();
  const edited = await getData(page);
  expect(edited.shifts[0]).toEqual(initial.shifts[0]);
  expect(edited.shifts[1].reserve).toEqual([]);
  expect(edited.reserveChanges![0].shiftId).toBe(shiftKey(initial.shifts[1]));
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page.getByLabel("یادآور روزانه فعال باشد").check();
  await page.getByLabel("ساعت اعلان به وقت تهران").fill("19:30");
  await page.getByLabel("اجرای خودکار هم‌شیفت هنگام ورود به ویندوز").check();
  await page.getByRole("button", { name: "ذخیرهٔ یادآور" }).click();
  await page.reload();
  expect((await getData(page)).reminder).toEqual({
    enabled: true,
    time: "19:30",
    runAtLogin: true,
  });
  expect((await getData(page)).shifts[1].reserve).toEqual([]);
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await expect(page.getByLabel("ساعت اعلان به وقت تهران")).toHaveValue("19:30");
  const restored = await getData(page);
  restored.reminder = { enabled: false, time: "07:45", runAtLogin: false };
  await page.locator("input[type=file]").setInputFiles({
    name: "preferences.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(restored)),
  });
  await page.getByRole("button", { name: "تأیید جایگزینی و بازیابی" }).click();
  await expect(page.getByLabel("ساعت اعلان به وقت تهران")).toHaveValue("07:45");
  await expect(page.getByLabel("یادآور روزانه فعال باشد")).not.toBeChecked();
});

test("four named locations share a date range with separate views, edits, exports, names and an independent proposal", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await importTeam(page);
  const names = ["ساختمان مرکزی", "بخش دوم", "نگهبانی", "کارگاه"];
  for (const name of names) {
    await openPlanner(page);
    await page.getByLabel("فهرست موقعیت", { exact: true }).selectOption("");
    await page.getByLabel("نام فهرست جدید").fill(name);
    await page
      .getByLabel("تاریخ شروع شمسی", { exact: true })
      .fill("1405/08/10");
    await page.getByLabel("تعداد روزهای برنامه").fill("2");
    await page
      .getByRole("button", { name: "ساخت برنامهٔ بازهٔ انتخابی" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  const data = await getData(page);
  expect(data.scheduleLists!.map((list) => list.name)).toEqual(names);
  expect(data.shifts).toHaveLength(8);
  const day = data.shifts.filter((s) => s.date === "2026-11-01");
  expect(new Set(day.flatMap((s) => [...s.primary, ...s.reserve])).size).toBe(
    16,
  );
  const secondId = data.scheduleLists![1].id;
  await page
    .getByRole("button", { name: "برنامهٔ شیفت‌ها", exact: true })
    .click();
  await page.getByLabel("فهرست نمایشی", { exact: true }).selectOption(secondId);
  await page.locator(".day-cell:has(.shift-chip)").first().click();
  await expect(page.getByRole("dialog")).toContainText("بخش دوم");
  await page.getByRole("button", { name: "ویرایش نفرات شیفت" }).click();
  const target = day.find((s) => s.listId === secondId)!;
  const used = day.flatMap((s) => [...s.primary, ...s.reserve]);
  const person = data.people.find(
    (p) => p.role === "companion" && !used.includes(p.id),
  )!;
  await page.getByLabel("همراه ۱", { exact: true }).selectOption(person.id);
  await page.getByLabel("علت ویرایش نفرات").fill("تغییر فقط برای بخش دوم");
  await page.getByLabel(/تغییر دستی با وجود تداخل/).check();
  await page.getByRole("button", { name: "ذخیرهٔ نفرات شیفت" }).click();
  const edited = await getData(page);
  expect(edited.shifts.find((s) => s.id === target.id)!.primary).toContain(
    person.id,
  );
  expect(edited.shifts.filter((s) => s.listId !== secondId)).toEqual(
    data.shifts.filter((s) => s.listId !== secondId),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروجی اکسل", exact: true }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await download).path())!);
  const sheet = workbook.worksheets[0];
  expect(sheet.getRow(1).getCell(13).text).toBe("فهرست / موقعیت");
  expect(sheet.getRow(11).getCell(13).text).toBe("بخش دوم");
  expect(
    sheet
      .getRows(2, 30)!
      .filter(
        (row) => row.getCell(13).text && row.getCell(13).text !== "بخش دوم",
      ),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "تاریخچهٔ برنامه‌ها", exact: true })
    .click();
  await page.getByLabel("فهرست تاریخچه").selectOption(secondId);
  await page.getByLabel("ویرایش نام فهرست").fill("ساختمان شماره دو");
  await page.getByRole("button", { name: "ذخیرهٔ نام فهرست" }).click();
  expect((await getData(page)).scheduleLists![1].name).toBe("ساختمان شماره دو");
  await openPlanner(page);
  await page.getByLabel("فهرست موقعیت", { exact: true }).selectOption("");
  await page.getByLabel("نام فهرست جدید").fill("پیشنهاد جایگزین");
  await page.getByLabel("کاربرد فهرست").selectOption("alternative");
  await page.getByLabel("تاریخ شروع شمسی", { exact: true }).fill("1405/08/10");
  await page.getByLabel("تعداد روزهای برنامه").fill("2");
  await page
    .getByRole("button", { name: "ساخت برنامهٔ بازهٔ انتخابی" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  const saved = await getData(page);
  expect(saved.scheduleLists).toHaveLength(5);
  expect(saved.scheduleLists!.at(-1)!.mode).toBe("alternative");
  expect(saved.shifts).toHaveLength(10);
  expect(saved.shiftChanges).toHaveLength(1);
});
