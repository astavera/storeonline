/**
 * Verifies the approved department landing experiences across desktop and mobile.
 */

import { expect, test } from "@playwright/test";

test("Toys starts directly with products and the catalog", async ({ page }, testInfo) => {
  await page.goto("/toys", { waitUntil: "domcontentloaded" });

  await expect(page.locator('[data-store-component="DepartmentImageHero"]')).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Toys shortcuts" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Shop by Category" })).toHaveCount(0);
  await expect(page.locator("#shop-by-age")).toHaveCount(0);
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));

  const cards = page.locator("#catalog article");
  if (await cards.count()) {
    const grid = page.locator(".department-product-grid");
    const columnCount = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columnCount).toBe(testInfo.project.name === "mobile" ? 2 : 5);
  }
});

test("Party Supplies uses an image-only hero and a responsive catalog", async ({ page }, testInfo) => {
    await page.goto("/party-supplies", { waitUntil: "domcontentloaded" });

    const hero = page.getByRole("region", { name: "Party Supplies hero" });
    await expect(hero).toBeVisible();
    const accessibleHeading = hero.getByRole("heading", { level: 1, name: "Party Supplies" });
    await expect(accessibleHeading).toHaveClass(/sr-only/);
    const headingBox = await accessibleHeading.boundingBox();
    expect(headingBox?.width).toBeLessThanOrEqual(1);
    expect(headingBox?.height).toBeLessThanOrEqual(1);
    await expect(hero.locator("img:visible")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Party Supplies shortcuts" }).getByRole("link")).toHaveCount(3);
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));

    const cards = page.locator("#catalog article");
    if (await cards.count()) {
      const grid = page.locator(".department-product-grid");
      const columnCount = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      expect(columnCount).toBe(testInfo.project.name === "mobile" ? 2 : 5);
    }
});

test("Holidays keeps its editorial hero and hides inactive collections", async ({ page }) => {
  await page.goto("/holidays", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Celebrate what’s happening now." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Holiday shortcuts" }).getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Active Holidays" })).toBeVisible();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));
});
