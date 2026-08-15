/**
 * Verifies the public returns route, mobile-safe semantics, and keyboard order.
 */

import { expect, test } from "@playwright/test";

test("returns portal is keyboard accessible before order data is disclosed", async ({ page }) => {
  await page.goto("/returns", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Start or track a return" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Return progress" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Find your order" })).toBeVisible();
  await expect(page.getByText("Most eligible items may be returned within 15 calendar days")).toBeAttached();

  const orderNumber = page.getByLabel("Order number");
  await orderNumber.focus();
  await page.keyboard.type("MS-1001");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email used for the order")).toBeFocused();
  await page.keyboard.type("customer@example.com");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Billing or delivery ZIP")).toBeFocused();
  await page.keyboard.type("10028");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send verification code" })).toBeFocused();

  await expect(page.getByText(/Verified Customer|123 Main St/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Contact Support" })).toBeVisible();
});
