/**
 * Verifies the product-detail layout and purchase path on desktop and mobile.
 */

import { expect, test } from "@playwright/test";

test("product detail exposes the essential purchase information without horizontal overflow", async ({ page }) => {
  await page.goto("/products/premium-building-set", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Premium Building Set" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Price and availability" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ways to receive it" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));
});

test("a product moves from its detail page into the validated cart", async ({ page }) => {
  await page.goto("/products/premium-building-set", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to cart" }).click();

  await expect(page.getByRole("group", { name: "Quantity in cart" })).toContainText("1");
  await page.goto("/cart", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Premium Building Set" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Cart items" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Order summary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review order details" })).toHaveAttribute("href", "/checkout");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));
});
