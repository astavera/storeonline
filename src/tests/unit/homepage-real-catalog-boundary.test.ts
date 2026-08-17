/**
 * Verifies production catalog failures never expose checked-in fixture products.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storefrontProducts } from "@/features/catalog/product-catalog";

const mocks = vi.hoisted(() => ({
  readCatalog: vi.fn()
}));

vi.mock("@/server/square/website-catalog-store", () => ({
  readResolvedSquareWebsiteCatalog: mocks.readCatalog
}));

import { resolveHomepageStorefrontContent } from "@/features/homepage/services/homepage-storefront-content-service";

beforeEach(() => {
  vi.stubEnv("E2E_CATALOG_FIXTURE", "false");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("homepage real catalog boundary", () => {
  it("returns no product cards when the production catalog is unavailable", async () => {
    mocks.readCatalog.mockResolvedValue(null);

    const content = await resolveHomepageStorefrontContent();

    expect(content.products).toEqual([]);
    expect(content.trendingProducts).toEqual([]);
    expect(content.categories).toEqual([]);
    expect(content.itemLinkOptions.some((option) => option.type === "product")).toBe(false);
  });

  it("keeps the checked-in products available only to explicit E2E tests", async () => {
    vi.stubEnv("E2E_CATALOG_FIXTURE", "true");
    mocks.readCatalog.mockResolvedValue(null);

    const content = await resolveHomepageStorefrontContent();

    expect(content.products).toHaveLength(storefrontProducts.length);
    expect(content.products[0]?.squareVariationId).toBe(storefrontProducts[0]?.squareVariationId);
  });
});
