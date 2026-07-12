import { expect, test } from "@playwright/test";

test("homepage renders primary departments and excludes Candy & Snacks from main navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Toys" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Party Supplies" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Balloons" }).first()).toBeVisible();
  await expect(page.locator("header")).not.toContainText("Candy");
  await expect(page.locator("[data-store-section='home.hero']")).toBeVisible();
});
