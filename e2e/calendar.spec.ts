import { test, expect } from "@playwright/test";
test("Fatimiyah is Friday 22 Aban in every calendar and Tehran today updates across midnight", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-13T20:29:45Z") });
  await page.goto("/");
  await expect(page.locator(".topbar-date")).toContainText(
    "جمعه، ۲۲ آبان ۱۴۰۵",
  );
  const friday = page.getByRole("gridcell", {
    name: "جمعه، ۲۲ آبان ۱۴۰۵، تعطیل",
    exact: true,
  });
  await expect(friday.locator(".cell-event")).toContainText("فاطمه");
  const saturday = page.getByRole("gridcell", {
    name: "شنبه، ۲۳ آبان ۱۴۰۵",
    exact: true,
  });
  await expect(saturday.locator(".cell-event")).toHaveCount(0);
  await friday.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("13 Nov 2026");
  await expect(dialog).toContainText("۳ جمادی‌الثانی ۱۴۴۸");
  await expect(dialog).toContainText("شهادت حضرت فاطمه");
  await page.keyboard.press("Escape");
  await page.clock.runFor(31000);
  await expect(page.locator(".topbar-date")).toContainText(
    "شنبه، ۲۳ آبان ۱۴۰۵",
  );
  await expect(saturday).toContainText("امروز");
});
