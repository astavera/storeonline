/**
 * Verifies the empty-cart customer journey across desktop and mobile.
 */

import { expect, test } from "@playwright/test";

test("empty cart stays concise and offers a clear next step", async ({ page }) => {
  await page.goto("/cart", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Cart" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your cart is empty" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Continue shopping" })).toHaveAttribute("href", "/shop");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));
});
