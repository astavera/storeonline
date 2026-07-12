import { expect, test } from "@playwright/test";

test("shop keeps products close and filters accessible on every viewport", async ({ page }, testInfo) => {
  await page.goto("/shop");

  await expect(page.getByRole("heading", { level: 1, name: /Shop/i })).toBeVisible();
  await expect(page.getByRole("region", { name: "Products" })).toBeVisible();

  const mobileFilters = page.locator("aside > details");

  if (testInfo.project.name === "mobile") {
    await expect(mobileFilters).toBeVisible();
    await expect(mobileFilters).not.toHaveAttribute("open", "");
    await mobileFilters.getByText("Filters", { exact: true }).click();
    await expect(mobileFilters).toHaveAttribute("open", "");
    await expect(mobileFilters.getByText("Category", { exact: true })).toBeVisible();
  } else {
    await expect(mobileFilters).toBeHidden();
    await expect(page.locator("aside").getByRole("heading", { exact: true, name: "Filter" })).toBeVisible();
  }
});
