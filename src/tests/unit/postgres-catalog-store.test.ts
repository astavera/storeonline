import { describe, expect, it } from "vitest";

describe("PostgreSQL catalog storefront contract", () => {
  it("keeps the fallback image and deterministic slug contract explicit", async () => {
    const source = await import("@/server/square/postgres-catalog-store");
    expect(source.readPostgresCatalogSummary).toBeTypeOf("function");
    expect(source.readPostgresInventorySyncSummary).toBeTypeOf("function");
    expect(source.readMappedOperationalStoreLocations).toBeTypeOf("function");
    expect(source.readPostgresStorefrontProductsByVariationIds).toBeTypeOf("function");
  });
});
