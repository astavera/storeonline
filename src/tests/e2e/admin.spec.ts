/**
 * Verifies the admin customer journey with end-to-end browser coverage.
 */

import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const topLevelAdminRoutes = [
  "/admin",
  "/admin/audit-log",
  "/admin/balloons",
  "/admin/delivery-zones",
  "/admin/departments",
  "/admin/fulfillment",
  "/admin/holidays",
  "/admin/homepage",
  "/admin/locations",
  "/admin/media-library",
  "/admin/navigation",
  "/admin/orders",
  "/admin/product-display",
  "/admin/product-images",
  "/admin/product-overrides",
  "/admin/product-placement",
  "/admin/products",
  "/admin/product-seo",
  "/admin/shipping",
  "/admin/slots",
  "/admin/storefront-pages",
  "/admin/sync-status",
  "/admin/theme",
  "/admin/users-roles",
  "/admin/webhooks"
] as const;

test("all top-level admin screens load without an error boundary", async ({ page }) => {
  test.setTimeout(420_000);

  for (const route of topLevelAdminRoutes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response, `${route} should return a document response`).not.toBeNull();
    expect(response?.status(), `${route} should not return a server error`).toBeLessThan(500);
    await expect(page.getByRole("main").first(), `${route} should render its admin content`).toBeVisible({ timeout: 30_000 });
    if (await page.getByRole("heading", { name: "Something went wrong." }).count()) {
      throw new Error(`${route} rendered the application error boundary.`);
    }
  }
});

test("admin dashboard and responsive navigation load", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Current admin work" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open catalog publishing" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Website Editor" }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Admin navigation" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Catalog Publishing" }).first()).toBeVisible();
});

test("website editor is canonical and its page selector is searchable", async ({ page }) => {
  await page.goto("/admin/builder/homepage/home", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/admin\/homepage$/);
  const editor = page.locator('[data-store-component="HomepageVisualEditor"]');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-hydrated", "true", { timeout: 45_000 });

  const pageSwitcher = page.getByRole("combobox", { exact: true, name: "Page" });
  await pageSwitcher.click();
  const pageSearch = page.getByRole("combobox", { name: "Search pages" });
  await expect(pageSearch).toBeVisible();
  await pageSearch.fill("holiday");
  await pageSearch.press("Escape");
  await expect(pageSwitcher).toBeFocused();

  await page.getByRole("button", { name: "Mobile" }).click();
  await expect(page.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true");
});

test("catalog filters are searchable and the workspace survives navigation", async ({ page }) => {
  await page.goto("/admin/product-placement#products", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Full Square catalog" })).toBeVisible({ timeout: 90_000 });

  await expect(page.getByText("Selection scope")).toBeVisible();
  await expect(page.getByRole("button", { name: /This page \(/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /All filtered \(/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "All with images" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Select images/ })).toHaveCount(0);

  const squareCategory = page.getByRole("combobox", { name: "Filter by Square category" });
  await expect(squareCategory).toBeEnabled({ timeout: 90_000 });
  await squareCategory.click();
  const categorySearch = page.getByRole("combobox", { name: "Search Square categories" });
  await categorySearch.fill("balloon");
  await expect(categorySearch).toHaveValue("balloon");
  await categorySearch.press("Escape");

  const productSearch = page.getByPlaceholder("Search name, SKU or GTIN");
  await productSearch.fill("balloon");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter by image" }).selectOption("with");
  await page.waitForTimeout(400);

  await page.goto("/admin/homepage", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-store-component="HomepageVisualEditor"]')).toBeVisible();
  await page.goto("/admin/product-placement#products", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Full Square catalog" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByPlaceholder("Search name, SKU or GTIN")).toHaveValue("balloon");
  await expect(page.getByRole("combobox", { name: "Filter by image" })).toHaveValue("with");

  const persistedWorkspace = await page.evaluate(() => window.localStorage.getItem("modern-state:admin:catalog-publishing-workspace:v1"));
  expect(persistedWorkspace).toContain('"query":"balloon"');
});

test("bulk area has one clear workflow and routes manual work to Full Catalog", async ({ page }) => {
  await page.goto("/admin/product-placement#bulk", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 2, name: "Bulk catalog tools" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("heading", { level: 3, name: "CSV & Excel import" })).toBeVisible();
  await expect(page.getByText("Use Products for manual bulk changes across the full Square catalog.")).toBeVisible();
  await expect(page.getByText("Multi-product bulk editor")).toHaveCount(0);

  await page.getByRole("button", { name: "Open Products" }).click();
  await expect(page).toHaveURL(/#products$/);
  await expect(page.getByRole("heading", { name: "Full Square catalog" })).toBeVisible();
});
