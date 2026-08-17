/**
 * Verifies development mode cannot silently substitute the checked-in catalog
 * fixture for the operational PostgreSQL/Square catalog.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/square/postgres-catalog-store", () => ({
  readMappedOperationalStoreLocations: async () => [],
  readPostgresInventorySyncSummary: async () => ({ available: false })
}));

vi.mock("@/server/square/website-catalog-store", () => ({
  readResolvedSquareWebsiteCatalog: async () => null
}));

import { quoteCartFromOperationalCatalog } from "@/server/checkout/cart-service";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("operational cart catalog boundary", () => {
  it("fails closed in development when the E2E catalog fixture is disabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_CATALOG_FIXTURE", "false");

    await expect(quoteCartFromOperationalCatalog({ items: [] }))
      .rejects.toBeInstanceOf(PersistenceUnavailableError);
  });
});
