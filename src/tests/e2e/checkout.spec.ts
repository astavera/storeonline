import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("checkout stays safely disabled when the Square payment switch is off", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("modern-state-cart", JSON.stringify([
      { squareVariationId: "seed-toy-building-set", quantity: 1 }
    ]));
  });

  await page.goto("/checkout", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Review your order" })).toBeVisible();
  const storeSelect = page.getByLabel("Store fulfilling this order");
  await expect(storeSelect).toBeVisible({ timeout: 30_000 });
  await expect(storeSelect.locator("option")).toHaveCount(2);
  await storeSelect.selectOption("store-86th-street");

  await expect(page.getByRole("radio", { name: "Pickup" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Local delivery" })).toBeAttached();
  await expect(page.getByRole("radio", { name: "Shipping" })).toHaveCount(0);

  await page.getByLabel("Name").fill("Test Customer");
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Phone").fill("2125550100");

  await expect(page.getByText("Secure checkout is temporarily unavailable.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to Square" })).toBeDisabled();
});

test("checkout waits for OrderPro to return a local delivery slot", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("modern-state-cart", JSON.stringify([
      { squareVariationId: "seed-toy-building-set", quantity: 1 }
    ]));
    window.sessionStorage.setItem("modern-state-balloon-fulfillment", JSON.stringify({
      version: 1,
      mode: "delivery",
      locationId: "store-3rd-avenue",
      address: {
        line1: "500 E 80th St",
        city: "New York",
        state: "NY",
        postalCode: "10075",
        country: "US"
      }
    }));
  });

  await page.goto("/checkout", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("radio", { name: "Local delivery" })).toBeChecked({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Check your delivery address" })).toBeVisible();
  await expect(page.getByLabel("Street address")).toHaveValue("500 E 80th St");
  const quoteResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/fulfillment/local-delivery-quote") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Check delivery" }).click();
  const quoteResponse = await quoteResponsePromise;

  expect(quoteResponse.status()).toBe(200);
  await expect(page.getByText("Delivery is available")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("3rd Avenue Store").last()).toBeVisible();
  await expect(page.getByText("$25.00").last()).toBeVisible();
  await expect(page.getByText("Available times from OrderPro will appear here for this date.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to Square" })).toBeDisabled();
});

test("balloon local delivery continues only after OrderPro approves the ZIP code", async ({ page }) => {
  await page.goto("/balloons?collection=latex", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Local delivery" }).click();
  await expect(page.getByLabel("Street address")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check delivery" })).toBeDisabled();
  await page.getByLabel("ZIP code").fill("10028");
  const eligibilityResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/fulfillment/local-delivery-postal-eligibility") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Check delivery" }).click();
  const eligibilityResponse = await eligibilityResponsePromise;

  expect(eligibilityResponse.status()).toBe(200);
  await expect(page).toHaveURL(/\/shop\?collection=latex&fulfillment=delivery&postalCode=10028/, { timeout: 15_000 });
});
