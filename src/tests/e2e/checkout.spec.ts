import { expect, test } from "@playwright/test";

test("checkout validates a cart against the selected store without placing or charging an order", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("modern-state-cart", JSON.stringify([
      { squareVariationId: "seed-toy-building-set", quantity: 1 }
    ]));
  });

  await page.goto("/checkout", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Review your order" })).toBeVisible();
  const storeSelect = page.getByLabel("Store fulfilling this order");
  await expect(storeSelect).toBeVisible();
  await expect(storeSelect.locator("option")).toHaveCount(2);
  await storeSelect.selectOption("store-86th-street");

  await expect(page.getByRole("radio", { name: "Pickup" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Local delivery" })).toBeAttached();
  await expect(page.getByRole("radio", { name: "Shipping" })).toHaveCount(0);

  await page.getByLabel("Name").fill("Test Customer");
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Phone").fill("2125550100");

  const requestPromise = page.waitForRequest((request) => request.url().endsWith("/api/checkout") && request.method() === "POST");
  await page.getByRole("button", { name: "Check order details" }).click();
  const request = await requestPromise;
  const payload = request.postDataJSON() as { locationId: string };

  expect(payload.locationId).toBe("store-86th-street");
  expect(request.headers()["idempotency-key"]).toHaveLength(36);
  await expect(page.getByRole("status")).toContainText("No order was placed and no payment was taken.");
});
