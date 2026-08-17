/**
 * Verifies admin catalog reads cannot inspect rows until the active Square
 * environment has an exact completed synchronization record.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  catalogSummary: vi.fn(),
  productsByVariationIds: vi.fn(),
  queryRaw: vi.fn(),
  groupBy: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  getPrismaClient: () => ({
    $queryRaw: mocks.queryRaw,
    squareCatalogObject: { groupBy: mocks.groupBy }
  })
}));

vi.mock("@/server/square/postgres-catalog-store", () => ({
  readPostgresCatalogSummary: mocks.catalogSummary,
  readPostgresStorefrontProductsByVariationIds: mocks.productsByVariationIds
}));

import {
  readPostgresAdminCatalogCategories,
  readPostgresAdminCatalogPage,
  readPostgresAdminCatalogSummary,
  readPostgresAdminVariationSelection
} from "@/server/square/postgres-admin-catalog-store";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("E2E_CATALOG_FIXTURE", "false");
  mocks.catalogSummary.mockResolvedValue({
    available: false,
    environment: null,
    itemCount: 10,
    variationCount: 20,
    updatedAt: null
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PostgreSQL admin catalog synchronization boundary", () => {
  it.each([
    ["page", () => readPostgresAdminCatalogPage()],
    ["selection", () => readPostgresAdminVariationSelection()],
    ["categories", () => readPostgresAdminCatalogCategories()],
    ["summary", () => readPostgresAdminCatalogSummary()]
  ])("fails closed before reading %s rows when sync evidence is unavailable", async (_name, read) => {
    await expect(read()).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.groupBy).not.toHaveBeenCalled();
    expect(mocks.productsByVariationIds).not.toHaveBeenCalled();
  });

  it("returns a completed summary only after exact active-environment evidence", async () => {
    mocks.catalogSummary.mockResolvedValue({
      available: true,
      environment: "production",
      itemCount: 10,
      variationCount: 20,
      updatedAt: "2026-08-16T22:00:00.000Z"
    });
    mocks.groupBy.mockResolvedValue([
      { type: "IMAGE", _count: { _all: 8 } },
      { type: "CATEGORY", _count: { _all: 4 } }
    ]);

    await expect(readPostgresAdminCatalogSummary()).resolves.toMatchObject({
      available: true,
      environment: "production",
      status: "completed",
      itemCount: 10,
      variationCount: 20,
      imageCount: 8,
      categoryCount: 4
    });
  });
});
