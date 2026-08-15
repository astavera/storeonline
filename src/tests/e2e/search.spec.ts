/**
 * Verifies the search customer journey with end-to-end browser coverage.
 */

import { expect, test } from "@playwright/test";

test("catalog search returns matching products and a useful empty state", async ({ page }) => {
  await page.goto("/search?q=balloons");

  const results = page.getByRole("region", { name: "Search results" });
  await expect(page.locator("#catalog-search")).toHaveValue("balloons");
  await expect(results.getByRole("heading", { name: /Results for .*balloons/ })).toBeVisible();
  await expect(results).toContainText("1 product found");
  await expect(results.getByRole("heading", { name: "Mylar Balloon Pick" })).toBeVisible();

  await page.goto("/search?q=not-a-real-product", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "No products matched that search." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Search results" }).getByRole("link", { exact: true, name: "Shop all" })).toBeVisible();
});
