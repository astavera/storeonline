/**
 * Verifies the checked-in storefront catalog fixture is a complete public
 * read source without requiring the hosted design-preview mode.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storefrontProducts } from "@/features/catalog/product-catalog";
import { filterWebsiteCatalogProducts } from "@/features/catalog/services/website-merchandising-service";
import { quoteCartFromOperationalCatalog } from "@/server/checkout/cart-service";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storefront E2E catalog fixture", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STOREFRONT_ADMIN_PREVIEW", "false");
    vi.stubEnv("STOREFRONT_DESIGN_PREVIEW", "false");
    vi.stubEnv("E2E_CATALOG_FIXTURE", "true");
  });

  it("resolves fixture products and category-page assignments as a public catalog", async () => {
    const source = await readResolvedSquareWebsiteCatalog();

    expect(source).toMatchObject({
      source: "static-preview",
      sourceVariationCount: storefrontProducts.length,
      fetchedAt: "2026-01-01T00:00:00.000Z"
    });

    const catalog = source!.catalog;
    const toys = catalog.categories.find((category) => category.slug === "toys");
    const product = catalog.products.find((candidate) => candidate.slug === "premium-building-set");

    expect(toys).toMatchObject({ id: "e2e-toys", name: "Toys", visible: true });
    expect(product).toMatchObject({
      squareVariationId: "seed-toy-building-set",
      websiteCategorySlugs: ["toys"],
      websiteSurfaces: ["shop", "search", "category-pages"]
    });
    expect(filterWebsiteCatalogProducts(catalog, {
      categoryId: toys!.id,
      surface: "category-pages"
    })).toEqual([expect.objectContaining({ squareVariationId: "seed-toy-building-set" })]);
  });

  it("quotes the fixture cart while design preview is disabled", async () => {
    const quote = await quoteCartFromOperationalCatalog({
      items: [{ squareVariationId: "seed-toy-building-set", quantity: 1 }]
    });

    expect(quote).toMatchObject({
      catalogSource: "static-preview",
      availabilityScope: "static-preview",
      itemCount: 1,
      subtotalCents: 2499
    });
    expect(quote.errors).toEqual([]);
  });

  it("simulates low stock without requiring a live Square inventory sync", async () => {
    const available = await quoteCartFromOperationalCatalog({
      items: [{ squareVariationId: "seed-mylar-balloon-pick", quantity: 2 }]
    });

    expect(available).toMatchObject({
      catalogSource: "static-preview",
      inventoryAsOf: null,
      errors: [],
      lines: [expect.objectContaining({ availableQuantity: 2, quantity: 2 })]
    });
  });
});
