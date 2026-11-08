import { _electron as electron, test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ElectronApplication } from "@playwright/test";

test("native shell loads the custom splash and persists selected themes and fonts to disk", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hamshift-native-"),
  );
  const install = path.join(directory, "install"),
    userData = path.join(directory, "data");
  await fs.mkdir(install);
  await fs.copyFile(
    "assets/hamshift.png",
    path.join(install, "splash-logo.png"),
  );
  let application: ElectronApplication | undefined;
  const launch = (delay = "100") =>
    electron.launch({
      args: [
        "--no-sandbox",
        "--ozone-platform=headless",
        "--ozone-override-screen-size=1440,1000",
        "--disable-gpu",
        ".",
      ],
      env: {
        ...process.env,
        HAMSHIFT_TEST: "1",
        HAMSHIFT_TEST_DATA: userData,
        HAMSHIFT_TEST_INSTALL: install,
        HAMSHIFT_TEST_SPLASH_MS: delay,
        XDG_CACHE_HOME: "/tmp/hamshift-cache",
      },
    });
  try {
    application = await launch("3000");
    const splash = await application.firstWindow();
    await splash.setViewportSize({ width: 520, height: 390 });
    await expect(splash.locator("#splash-logo")).toHaveAttribute(
      "src",
      /^data:image\/png;base64,/,
    );
    await expect(splash.getByRole("progressbar")).toBeVisible();
    await expect
      .poll(() =>
        application!
          .windows()
          .find((p) => p.url().includes("/dist/index.html"))
          ?.url(),
      )
      .toBeTruthy();
    const page = application
      .windows()
      .find((p) => p.url().includes("/dist/index.html"))!;
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect(
      page.getByRole("heading", { name: "برنامهٔ شیفت‌ها." }),
    ).toBeVisible();
    expect(await page.evaluate(() => typeof window.desktop?.readData)).toBe(
      "function",
    );
    await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
    await page.getByRole("button", { name: "تم شب آرام", exact: true }).click();
    await page
      .getByRole("button", { name: "فونت استعداد", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "midnight",
    );
    await expect(page.locator("html")).toHaveAttribute("data-font", "estedad");
    const stored = JSON.parse(
      await fs.readFile(path.join(userData, "hamshift-data.json"), "utf8"),
    );
    expect(stored.appearance).toEqual({ theme: "midnight", font: "estedad" });
    expect((await page.evaluate(() => window.desktop!.branding())).custom).toBe(
      true,
    );
    await page.screenshot({
      path: "test-results/desktop-dark.png",
      fullPage: true,
    });
    // Requests outside the local app are blocked by the desktop session.
    expect(
      await page.evaluate(async () => {
        try {
          await fetch("https://example.com");
          return true;
        } catch {
          return false;
        }
      }),
    ).toBe(false);
    await application.close();
    application = undefined;
    application = await launch();
    await expect
      .poll(() =>
        application!
          .windows()
          .find((p) => p.url().includes("/dist/index.html"))
          ?.url(),
      )
      .toBeTruthy();
    const restored = application
      .windows()
      .find((p) => p.url().includes("/dist/index.html"))!;
    await restored.setViewportSize({ width: 1440, height: 960 });
    await expect(restored.locator("html")).toHaveAttribute(
      "data-theme",
      "midnight",
    );
    await expect(restored.locator("html")).toHaveAttribute(
      "data-font",
      "estedad",
    );
    await expect(restored.getByRole("gridcell")).toHaveCount(
      stored.shifts.length,
    );
  } finally {
    await application?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("all six themes and three bundled fonts can be selected and survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  for (const [id, name] of [
    ["emerald", "باغ زمرد"],
    ["violet", "یاس بنفش"],
    ["ocean", "آبی اقیانوس"],
    ["sunset", "غروب طلایی"],
    ["rose", "شکوفهٔ رز"],
    ["midnight", "شب آرام"],
  ]) {
    await page.getByRole("button", { name: `تم ${name}`, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
  }
  for (const name of ["وزیرمتن", "استعداد", "نوتو عربی"]) {
    await page
      .getByRole("button", { name: `فونت ${name}`, exact: true })
      .click();
    expect(
      await page.evaluate(() =>
        document.fonts.check(
          '12px "' +
            (
              {
                vazirmatn: "Vazirmatn Variable",
                estedad: "Estedad Variable",
                noto: "Noto Sans Arabic Variable",
              } as Record<string, string>
            )[document.documentElement.dataset.font!] +
            '"',
        ),
      ),
    ).toBe(true);
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await expect(page.locator("html")).toHaveAttribute("data-font", "noto");
});
