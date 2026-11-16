import { _electron as electron, test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ElectronApplication } from "@playwright/test";

const data = {
  version: 1,
  demo: false,
  people: [
    { id: "1", name: "کارمند اول", department: "عملیات", active: true, reserveOnly: false },
    { id: "2", name: "کارمند دوم", department: "عملیات", active: true, reserveOnly: false },
  ],
  shifts: [{ scheduleId: "night-team", date: "2026-11-15", primary: ["1"], reserve: ["2"], attendance: [] }],
  schedules: [{ id: "night-team", name: "تیم شب", startDate: "2026-11-15", endDate: "2026-11-15", personIds: ["1", "2"], location: "محل خدمت تست" }],
  locations: ["محل خدمت تست"],
  reminder: { enabled: true, scheduleId: "night-team", time: "08:00", daysBefore: 1 },
  swaps: [],
  events: [],
  settings: { primaryCount: 1, reserveCount: 1, minRestDays: 1, hijriOffset: 0 },
  appearance: { theme: "ocean", font: "amiri", fontScale: 115 },
};

const launch = (directory: string) => electron.launch({
  args: ["--no-sandbox", "--ozone-platform=headless", "--ozone-override-screen-size=1440,1000", "--disable-gpu", "."],
  env: {
    ...process.env,
    HAMSHIFT_TEST: "1",
    HAMSHIFT_TEST_DATA: directory,
    HAMSHIFT_TEST_INSTALL: directory,
    HAMSHIFT_TEST_SPLASH_MS: "20",
    XDG_CACHE_HOME: "/tmp/hamshift-cache",
  },
});

async function mainPage(application: ElectronApplication) {
  await expect.poll(() => application.windows().some((p) => p.url().includes("/dist/index.html"))).toBe(true);
  const page = application.windows().find((p) => p.url().includes("/dist/index.html"))!;
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByRole("heading", { name: "برنامهٔ شیفت‌ها." })).toBeVisible();
  return page;
}

test("a temporary startup write failure does not permanently lock theme and font changes", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let failOnce = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === "hamshift:data:v1" && failOnce) {
        failOnce = false;
        throw new DOMException("Temporary write failure", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(page.getByText(/فضای.*(آزاد|دستگاه)|فضای ذخیره‌سازی/).first()).toBeVisible();
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page.getByRole("button", { name: "تم شب آرام", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await page.getByRole("button", { name: "فونت استعداد", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-font", "estedad");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("hamshift:data:v1")!).appearance))
    .toEqual({ theme: "midnight", font: "estedad" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await expect(page.locator("html")).toHaveAttribute("data-font", "estedad");
});

for (const [name, original] of [
  ["truncated JSON", "{broken"],
  ["inconsistent records", JSON.stringify({ ...data, shifts: [{ ...data.shifts[0], reserve: ["unknown"] }] })],
] as const) {
  test(`the native app recovers ${name}, preserves the original, and keeps staff and preferences after restarting`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hamshift-recovery-"));
    const file = path.join(directory, "hamshift-data.json");
    let application: ElectronApplication | undefined;
    try {
      await fs.writeFile(file, original);
      await fs.writeFile(file + ".bak", JSON.stringify(data));
      application = await launch(directory);
      let page = await mainPage(application);
      await expect(page.getByText(/آخرین پشتیبان خودکار معتبر بازیابی شد/)).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(data);
      const archive = (await fs.readdir(directory)).find((name) => name.startsWith("hamshift-data.recovery-"));
      expect(archive).toBeTruthy();
      expect(await fs.readFile(path.join(directory, archive!), "utf8")).toBe(original);
      await page.getByRole("button", { name: /^پرسنل/ }).click();
      await expect(page.getByRole("button", { name: "کارمند اول مشاهدهٔ پرونده", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
      await page.getByRole("button", { name: "تم شب آرام", exact: true }).click();
      await page.getByRole("button", { name: "فونت استعداد", exact: true }).click();
      await page.getByRole("button", { name: "بزرگ‌تر", exact: true }).click();
      expect(JSON.parse(await fs.readFile(file, "utf8")).appearance.fontScale).toBe(120);
      await page.getByRole("button", { name: "کوچک‌تر", exact: true }).click();
      const saved = JSON.parse(await fs.readFile(file, "utf8"));
      expect(saved).toEqual({ ...data, appearance: { theme: "midnight", font: "estedad", fontScale: 115 } });
      const backupBeforeRestart = await fs.readFile(file + ".bak", "utf8");
      await application.close();
      application = await launch(directory);
      page = await mainPage(application);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
      await expect(page.locator("html")).toHaveAttribute("data-font", "estedad");
      await expect(page.locator("html")).toHaveCSS("font-size", "14.95px");
      expect(await fs.readFile(file + ".bak", "utf8")).toBe(backupBeforeRestart);
      expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(saved);
    } finally {
      await application?.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}

test("unrecoverable native files are preserved and a manually restored backup becomes the new safe fallback", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hamshift-unreadable-"));
  const file = path.join(directory, "hamshift-data.json");
  let application: ElectronApplication | undefined;
  try {
    await fs.writeFile(file, "{original-broken");
    await fs.writeFile(file + ".bak", "{backup-broken");
    application = await launch(directory);
    const page = await mainPage(application);
    await expect(page.getByRole("alert")).toContainText("فایل‌ها را حذف نکنید");
    await expect(page.getByText("یک نگاه به هم‌شیفت", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
    await page.getByRole("button", { name: "تم شب آرام", exact: true }).click();
    expect(await fs.readFile(file, "utf8")).toBe("{original-broken");
    expect(await fs.readFile(file + ".bak", "utf8")).toBe("{backup-broken");
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole("button", { name: "دریافت پشتیبان کامل", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("پشتیبان خالی");
    expect(downloads).toEqual([]);
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "backup.json", mimeType: "application/json", buffer: Buffer.from(`\uFEFF${JSON.stringify(data)}`),
    });
    await page.getByRole("button", { name: "تأیید جایگزینی و بازیابی", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(data);
    expect(JSON.parse(await fs.readFile(file + ".bak", "utf8"))).toEqual(data);
    const files = await fs.readdir(directory);
    for (const [prefix, contents] of [["hamshift-data.recovery-", "{original-broken"], ["hamshift-backup.recovery-", "{backup-broken"]]) {
      const archive = files.find((name) => name.startsWith(prefix));
      expect(archive).toBeTruthy();
      expect(await fs.readFile(path.join(directory, archive!), "utf8")).toBe(contents);
    }
  } finally {
    await application?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
