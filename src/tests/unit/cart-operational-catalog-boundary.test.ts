/**
 * Verifies development mode cannot silently substitute the checked-in catalog
 * fixture for the operational PostgreSQL/Square catalog.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readLocations: vi.fn(),
  readInventory: vi.fn(),
  readCatalog: vi.fn()
}));

vi.mock("@/server/square/postgres-catalog-store", () => ({
  readMappedOperationalStoreLocations: mocks.readLocations,
  readPostgresInventorySyncSummary: mocks.readInventory
}));

vi.mock("@/server/square/website-catalog-store", () => ({
  readResolvedSquareWebsiteCatalog: mocks.readCatalog
}));

import { storefrontProducts } from "@/features/catalog/product-catalog";
import { quoteCartFromOperationalCatalog } from "@/server/checkout/cart-service";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

beforeEach(() => {
  mocks.readLocations.mockResolvedValue([]);
  mocks.readInventory.mockResolvedValue({ available: false });
  mocks.readCatalog.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("operational cart catalog boundary", () => {
  it("fails closed in development when the E2E catalog fixture is disabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_CATALOG_FIXTURE", "false");

    await expect(quoteCartFromOperationalCatalog({ items: [] }))
      .rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  it("delegates only selected shipping lines to OrderPRO inventory authority", async () => {
    const product = {
      ...storefrontProducts[0],
      inventoryTracked: true,
      availableQuantity: 0
    };
    mocks.readLocations.mockResolvedValue([]);
    mocks.readCatalog.mockResolvedValue({
      catalog: { products: [product] },
      source: "postgres",
      sourceVariationCount: 1,
      fetchedAt: "2026-08-21T12:00:00.000Z"
    });
    mocks.readInventory.mockResolvedValue({ available: false });

    const quote = await quoteCartFromOperationalCatalog(
      { items: [{ squareVariationId: product.squareVariationId, quantity: 1 }] },
      { orderProShippingCheckoutGroups: ["regular"] }
    );

    expect(quote.errors).toEqual([]);
    expect(quote.lines[0]).toMatchObject({
      squareVariationId: product.squareVariationId,
      inventoryTracked: false,
      availableQuantity: null
    });
    expect(quote.warnings).toContain(
      "Shipping availability is verified directly by OrderPRO before rates and again before Square checkout."
    );
    expect(mocks.readInventory).not.toHaveBeenCalled();
  });
});
