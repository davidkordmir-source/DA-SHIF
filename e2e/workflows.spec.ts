import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import type { AppData } from "../src/types";
import {
  solarLabel,
  solar,
  todayKey,
  parseDate,
  dateKey,
} from "../src/lib/calendar";

const storageKey = "hamshift:data:v1";
const fixture = (): AppData => ({
  version: 1,
  demo: false,
  people: Array.from({ length: 12 }, (_, i) => ({
    id: String(5000 + i),
    name: `همکار تست ${i}`,
    department: i % 2 ? "عملیات" : "اداری",
    active: true,
    reserveOnly: false,
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
});
const getData = (page: Page) =>
  page.evaluate<AppData>(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  );
async function seed(page: Page, data: AppData) {
  await page.goto("/");
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: storageKey, data },
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
  await expect(picker).toHaveCount(0);
}

test("create a named list using solar pickers and a location, configure its reminders, and export a filtered report", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, fixture());
  await expect(
    page.getByRole("button", { name: "ورود پرسنل از اکسل", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page
    .getByLabel("نام محل خدمت", { exact: true })
    .fill("بیمارستان مرکزی");
  await page
    .getByRole("button", { name: "افزودن موقعیت", exact: true })
    .click();
  await page.getByRole("button", { name: "بزرگ‌تر", exact: true }).click();
  expect((await getData(page)).appearance?.fontScale).toBe(105);
  await expect(page.locator("html")).toHaveCSS("font-size", "13.65px");
  await page.reload();
  await expect(page.locator("html")).toHaveCSS("font-size", "13.65px");
  await page
    .getByRole("button", { name: "ایجاد برنامهٔ عادلانه", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "ورود پرسنل از اکسل", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("نام فهرست برنامه", { exact: true })
    .fill("فهرست ویژهٔ آبان");
  await pick(page, "تاریخ شروع برنامه", "2026-11-01");
  await pick(page, "تاریخ پایان برنامه", "2026-11-04");
  await page
    .getByLabel("محل خدمت برنامه", { exact: true })
    .selectOption("بیمارستان مرکزی");
  await page.getByRole("button", { name: /ساخت برنامهٔ/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const data = await getData(page);
  expect(data.shifts).toHaveLength(4);
  expect(data.schedules![0]).toMatchObject({
    name: "فهرست ویژهٔ آبان",
    location: "بیمارستان مرکزی",
    startDate: "2026-11-01",
    endDate: "2026-11-04",
  });
  await page.getByRole("button", { name: "اعلان‌ها", exact: true }).click();
  await page.getByLabel("یادآوری شیفت فعال باشد").check();
  await page
    .getByLabel("فهرست شیفت برای اعلان")
    .selectOption(data.schedules![0].id);
  await page.getByLabel("زمان اعلان (به وقت تهران)").fill("07:45");
  await page.getByLabel("زمان یادآوری نسبت به شیفت").selectOption("2");
  await page.getByRole("button", { name: "ذخیرهٔ یادآوری" }).click();
  expect((await getData(page)).reminder).toMatchObject({
    enabled: true,
    scheduleId: data.schedules![0].id,
    time: "07:45",
    daysBefore: 2,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "گزارش‌گیری", exact: true }).click();
  await pick(page, "از تاریخ گزارش", "2026-11-01");
  await pick(page, "تا تاریخ گزارش", "2026-11-04");
  await page.getByLabel("واحد گزارش", { exact: true }).selectOption("عملیات");
  await page
    .getByLabel("وضعیت شیفت در گزارش", { exact: true })
    .selectOption("off");
  const report = page.getByRole("region", { name: "گزارش‌گیری فیلترشده" });
  await expect(report).toContainText("بدون شیفت");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروجی اکسل گزارش" }).click();
  const downloaded = await pending,
    wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await downloaded.path())!);
  const sheet = wb.worksheets[0];
  expect(sheet.rowCount).toBeGreaterThan(5);
  for (let i = 6; i <= sheet.rowCount; i++) {
    expect(sheet.getRow(i).getCell(7).text).toBe("عملیات");
    expect(sheet.getRow(i).getCell(11).text).toBe("بدون شیفت");
  }
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page
    .getByRole("button", { name: "حذف موقعیت بیمارستان مرکزی", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "تأیید حذف موقعیت" }),
  ).toBeDisabled();
  await page
    .getByLabel("برای تأیید، نام موقعیت را بنویسید: بیمارستان مرکزی")
    .fill("بیمارستان مرکزی");
  await page.getByRole("button", { name: "تأیید حذف موقعیت" }).click();
  expect((await getData(page)).locations).toEqual([]);
  expect((await getData(page)).schedules![0].location).toBe("بیمارستان مرکزی");
  expect(errors).toEqual([]);
});

test("deletion records rights and future cancellation and restores its audit from backup", async ({
  page,
}) => {
  const data = fixture(),
    today = todayKey(),
    yesterday = dateKey(new Date(parseDate(today).getTime() - 86400000)),
    tomorrow = dateKey(new Date(parseDate(today).getTime() + 86400000));
  data.schedules = [
    {
      id: "roster-rights",
      name: "تیم دارای سابقه",
      startDate: yesterday,
      endDate: tomorrow,
      personIds: data.people.map((p) => p.id),
    },
  ];
  data.shifts = [yesterday, today, tomorrow].map((date) => ({
    date,
    scheduleId: "roster-rights",
    primary: ["5000", "5001"],
    reserve: ["5002", "5003"],
    attendance:
      date === yesterday
        ? [{ personId: "5000", status: "present", note: "ثبت قطعی" }]
        : [],
  }));
  data.reminder = {
    enabled: true,
    scheduleId: "roster-rights",
    time: "23:59",
    daysBefore: 0,
  };
  await seed(page, data);
  await page
    .getByRole("button", { name: "حذف برنامه تیم دارای سابقه", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "ثبت سند و حذف برنامه" }),
  ).toBeDisabled();
  expect((await getData(page)).shifts).toHaveLength(3);
  await expect(
    page.getByRole("option", {
      name: "برنامه اشتباه است و هیچ شیفتی اجرا یا ثبت نشده",
    }),
  ).toBeDisabled();
  await page.getByLabel("وضعیت حق شیفت افراد").selectOption("preserve");
  await page.getByLabel("نام مسئول ثبت").fill("مسئول آزمایشی");
  await page.getByLabel("دلیل حذف برنامه").fill("تغییر برنامه با ثبت حق اعضا");
  await page
    .getByText(
      "حق شیفت و حق استراحت افراد را بررسی کردم و مسئولیت این ثبت را می‌پذیرم.",
      { exact: true },
    )
    .click();
  await page
    .getByLabel("برای تأیید، نام برنامه را بنویسید: تیم دارای سابقه")
    .fill("تیم دارای سابقه");
  await page.getByRole("button", { name: "ثبت سند و حذف برنامه" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await getData(page);
  expect(saved.shifts).toEqual([]);
  expect(saved.archives![0].creditedDates).toEqual([yesterday, today]);
  expect(saved.reminder?.enabled).toBe(false);
  await page.reload();
  expect((await getData(page)).archives![0].recordedBy).toBe("مسئول آزمایشی");
  await page.getByText(/دفتر ثبت حق شیفت و حذف‌ها/).click();
  await page.getByRole("button", { name: "مشاهدهٔ سند و حق افراد" }).click();
  await expect(page.getByRole("dialog")).toContainText("مسئول آزمایشی");
  await expect(page.getByRole("dialog")).toContainText("همکار تست 0");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "دریافت پشتیبان کامل" }).click();
  const backup = await pending;
  await page.locator("input[type=file]").setInputFiles((await backup.path())!);
  await page.getByRole("button", { name: "تأیید جایگزینی و بازیابی" }).click();
  expect((await getData(page)).archives).toEqual(saved.archives);
});

test("reset requires backup, acknowledgement and an exact phrase, then clears data and appearance", async ({
  page,
}) => {
  const data = fixture();
  data.appearance = { theme: "ocean", font: "estedad", fontScale: 125 };
  data.locations = ["قدیمی"];
  await seed(page, data);
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page.getByRole("button", { name: "بازنشانی کل نرم‌افزار" }).click();
  await expect(
    page.getByRole("button", { name: "تأیید نهایی بازنشانی" }),
  ).toBeDisabled();
  await page
    .getByLabel("برای تأیید بنویسید: بازنشانی کامل")
    .fill("بازنشانی کامل");
  await expect(
    page.getByRole("button", { name: "تأیید نهایی بازنشانی" }),
  ).toBeDisabled();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "۱. دریافت پشتیبان قبل از بازنشانی" })
    .click();
  const backup = await pending;
  expect(await backup.path()).toBeTruthy();
  await page
    .getByText(
      "پشتیبان را دریافت و بررسی کردم؛ حق شیفت و استراحت افراد ثبت و محفوظ است.",
      { exact: true },
    )
    .click();
  await page.getByRole("button", { name: "تأیید نهایی بازنشانی" }).click();
  await expect(
    page.getByRole("heading", { name: "برنامهٔ شیفت‌ها." }),
  ).toBeVisible();
  const reset = await getData(page);
  expect(reset.people).toEqual([]);
  expect(reset.shifts).toEqual([]);
  expect(reset.locations).toBeUndefined();
  expect(reset.appearance).toBeUndefined();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "emerald");
  await expect(page.locator("html")).toHaveCSS("font-size", "13px");
  await page.reload();
  expect((await getData(page)).people).toEqual([]);
});

test("due reminders use the selected list and do not repeat after reload", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-14T04:29:00Z") });
  const data = fixture();
  data.schedules = [
    {
      id: "remind-this",
      name: "فهرست انتخابی",
      startDate: "2026-11-14",
      endDate: "2026-11-14",
      personIds: data.people.map((p) => p.id),
    },
  ];
  data.shifts = [
    {
      date: "2026-11-14",
      scheduleId: "remind-this",
      primary: ["5000", "5001"],
      reserve: ["5002", "5003"],
      attendance: [],
    },
  ];
  data.reminder = {
    enabled: true,
    scheduleId: "remind-this",
    time: "08:00",
    daysBefore: 0,
  };
  await seed(page, data);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.clock.runFor(60000);
  await expect(page.getByRole("status")).toContainText("یادآوری فهرست انتخابی");
  await expect(page.getByRole("status")).toContainText("همکار تست 0");
  await page.reload();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a storage failure cannot delete a list or claim its audit was saved", async ({
  page,
}) => {
  const data = fixture();
  data.schedules = [
    {
      id: "cannot-delete",
      name: "فهرست محفوظ",
      startDate: "2026-11-14",
      endDate: "2026-11-14",
      personIds: data.people.map((p) => p.id),
    },
  ];
  data.shifts = [
    {
      date: "2026-11-14",
      scheduleId: "cannot-delete",
      primary: ["5000", "5001"],
      reserve: ["5002", "5003"],
      attendance: [],
    },
  ];
  await seed(page, data);
  await page.getByRole("button", { name: "حذف برنامه فهرست محفوظ" }).click();
  await page.getByLabel("وضعیت حق شیفت افراد").selectOption("mistake");
  await page.getByLabel("نام مسئول ثبت").fill("مدیر");
  await page.getByLabel("دلیل حذف برنامه").fill("برنامهٔ اشتباه");
  await page
    .getByText(
      "حق شیفت و حق استراحت افراد را بررسی کردم و مسئولیت این ثبت را می‌پذیرم.",
      { exact: true },
    )
    .click();
  await page
    .getByLabel("برای تأیید، نام برنامه را بنویسید: فهرست محفوظ")
    .fill("فهرست محفوظ");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "hamshift:data:v1") throw new Error("quota");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "ثبت سند و حذف برنامه" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "ذخیرهٔ سند انجام نشد؛ برنامه حذف نشده است.",
  );
  expect((await getData(page)).shifts).toEqual(data.shifts);
  expect((await getData(page)).archives).toBeUndefined();
});

test("native background reminders persist delivery and keep working while minimized", async () => {
  test.setTimeout(60000);
  const { _electron } = await import("@playwright/test");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hamshift-reminder-"),
  );
  const data = fixture(),
    today = todayKey();
  data.schedules = [
    {
      id: "native-reminder",
      name: "یادآوری بومی",
      startDate: today,
      endDate: today,
      personIds: data.people.map((p) => p.id),
    },
  ];
  data.shifts = [
    {
      date: today,
      scheduleId: "native-reminder",
      primary: ["5000", "5001"],
      reserve: ["5002", "5003"],
      attendance: [],
    },
  ];
  data.reminder = {
    enabled: false,
    scheduleId: "native-reminder",
    time: "00:00",
    daysBefore: 0,
  };
  await fs.writeFile(
    path.join(directory, "hamshift-data.json"),
    JSON.stringify(data),
  );
  const application = await _electron.launch({
    args: ["--no-sandbox", "--ozone-platform=headless", "--disable-gpu", "."],
    env: {
      ...process.env,
      HAMSHIFT_TEST: "1",
      HAMSHIFT_TEST_DATA: directory,
      XDG_CACHE_HOME: "/tmp/hamshift-cache",
    },
  });
  try {
    await expect
      .poll(() =>
        application.windows().some((p) => p.url().includes("/dist/index.html")),
      )
      .toBe(true);
    const page = application
      .windows()
      .find((p) => p.url().includes("/dist/index.html"))!;
    await expect(
      page.getByRole("heading", { name: "برنامهٔ شیفت‌ها." }),
    ).toBeVisible();
    // Observe the native notification handoff without depending on a real OS
    // desktop notification daemon in the headless test environment.
    await application.evaluate(({ Notification }) => {
      (globalThis as any).notificationAttempts = [];
      Notification.isSupported = () => true;
      Notification.prototype.show = function () {
        (globalThis as any).notificationAttempts.push({
          title: this.title,
          body: this.body,
        });
      };
    });
    data.reminder.enabled = true;
    const saved = await page.evaluate(
      (json) => window.desktop!.writeData(json),
      JSON.stringify(data),
    );
    expect(saved.ok).toBe(true);
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("/dist/index.html"))!
        .minimize();
    });
    await expect
      .poll(
        () =>
          application.evaluate(() => (globalThis as any).notificationAttempts),
        { timeout: 20000 },
      )
      .toHaveLength(1);
    const delivered = JSON.parse(
      await fs.readFile(
        path.join(directory, "reminder-deliveries.json"),
        "utf8",
      ),
    );
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain("native-reminder");
    expect(
      await application.evaluate(
        () => (globalThis as any).notificationAttempts[0].body,
      ),
    ).toContain("همکار تست 0");
    // A second background tick must not notify for the same shift again.
    await page.waitForTimeout(16000);
    expect(
      await application.evaluate(
        () => (globalThis as any).notificationAttempts.length,
      ),
    ).toBe(1);
  } finally {
    await application.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
