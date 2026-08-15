/**
 * Verifies the shop customer journey with end-to-end browser coverage.
 */

import { expect, test } from "@playwright/test";

test("shop keeps products close and filters accessible on every viewport", async ({ page }, testInfo) => {
  await page.goto("/shop", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: /Shop/i })).toBeVisible();
  await expect(page.getByRole("region", { name: "Products" })).toBeVisible();

  const filterPanel = page.getByRole("complementary");

  if (testInfo.project.name === "mobile") {
    const filterTrigger = filterPanel.getByRole("button", { name: /Filter:/ });
    await expect(filterTrigger).toBeVisible();
    await expect(filterTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(async () => {
      if ((await filterTrigger.getAttribute("aria-expanded")) !== "true") {
        await filterTrigger.click({ force: true });
      }
      await expect(filterTrigger).toHaveAttribute("aria-expanded", "true");
    }).toPass({ timeout: 15_000 });
    const filterDialog = page.getByRole("dialog", { name: "Product filters" });
    await expect(filterDialog).toBeVisible();
    await expect(filterDialog.getByText("Product Category", { exact: true })).toBeVisible();
  } else {
    await expect(filterPanel.getByRole("button", { name: /Filter:/ })).toBeHidden();
    await expect(filterPanel.getByRole("heading", { exact: true, name: "Filter:" })).toBeVisible();
  }
});
