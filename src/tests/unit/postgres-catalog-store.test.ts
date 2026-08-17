/**
 * Verifies the isolated behavior of postgres catalog store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const prisma = {
    squareCatalogSyncState: {
      findMany: vi.fn(),
      findUnique: vi.fn()
    },
    squareCatalogObject: {
      count: vi.fn(),
      findMany: vi.fn()
    },
    squareItemVariation: {
      count: vi.fn(),
      findMany: vi.fn()
    },
    storeLocation: {
      findMany: vi.fn()
    }
  };

  return {
    getPrismaClient: vi.fn(() => prisma),
    prisma
  };
});

const { getPrismaClient, prisma } = database;

vi.mock("@/server/db/prisma", () => ({
  getPrismaClient
}));

const startedAt = new Date("2026-08-16T12:00:00.000Z");
const completedAt = new Date("2026-08-16T12:05:00.000Z");
const currentTime = new Date("2026-08-16T12:10:00.000Z");

function completedState(environment: "sandbox" | "production" = "production") {
  return {
    environment,
    latestTime: "2026-08-16T12:04:59.000Z",
    lastStartedAt: startedAt,
    lastCompletedAt: completedAt,
    lastError: null,
    lockedAt: null,
    lockToken: null
  };
}

function completedInventoryState(environment: "sandbox" | "production" = "production") {
  return {
    ...completedState(environment),
    environment: `${environment}:inventory`,
    latestTime: startedAt.toISOString()
  };
}

async function loadStore(environment: "sandbox" | "production" = "production") {
  vi.stubEnv("SQUARE_ENVIRONMENT", environment);
  vi.resetModules();
  return import("@/server/square/postgres-catalog-store");
}

describe("PostgreSQL catalog storefront contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(currentTime);
    vi.clearAllMocks();
    getPrismaClient.mockReturnValue(prisma);
    prisma.squareCatalogSyncState.findMany.mockResolvedValue([completedState()]);
    prisma.squareCatalogObject.count.mockResolvedValue(2);
    prisma.squareItemVariation.count.mockResolvedValue(3);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("accepts a completed, unlocked catalog sync for the active production environment", async () => {
    const source = await loadStore("production");

    await expect(source.readPostgresCatalogSummary()).resolves.toEqual({
      available: true,
      environment: "production",
      itemCount: 2,
      variationCount: 3,
      updatedAt: completedAt.toISOString()
    });
    expect(prisma.squareCatalogSyncState.findMany).toHaveBeenCalledWith({
      where: { environment: { in: ["sandbox", "production"] } },
      select: {
        environment: true,
        latestTime: true,
        lastStartedAt: true,
        lastCompletedAt: true,
        lastError: true,
        lockedAt: true,
        lockToken: true
      }
    });
  });

  it("validates one Prisma client before starting concurrent catalog summary reads", async () => {
    const databaseUrlError = new Error("DATABASE_URL is required for database-backed operations.");
    getPrismaClient.mockImplementation(() => {
      throw databaseUrlError;
    });
    const source = await loadStore("production");

    await expect(source.readPostgresCatalogSummary()).rejects.toMatchObject({
      cause: databaseUrlError,
      code: "PERSISTENCE_UNAVAILABLE",
      name: "PersistenceUnavailableError"
    });
    expect(getPrismaClient).toHaveBeenCalledTimes(1);
    expect(prisma.squareCatalogSyncState.findMany).not.toHaveBeenCalled();
    expect(prisma.squareCatalogObject.count).not.toHaveBeenCalled();
    expect(prisma.squareItemVariation.count).not.toHaveBeenCalled();
  });

  it("accepts the same exact evidence for an explicitly active sandbox environment", async () => {
    prisma.squareCatalogSyncState.findMany.mockResolvedValue([completedState("sandbox")]);
    const source = await loadStore("sandbox");

    await expect(source.readPostgresCatalogSummary()).resolves.toMatchObject({
      available: true,
      environment: "sandbox"
    });
  });

  it.each([
    ["missing state", []],
    ["wrong environment", [completedState("sandbox")]],
    ["mixed environment states", [completedState("production"), completedState("sandbox")]],
    ["missing watermark", [{ ...completedState(), latestTime: null }]],
    ["blank watermark", [{ ...completedState(), latestTime: "  " }]],
    ["invalid watermark", [{ ...completedState(), latestTime: "not-a-time" }]],
    ["watermark after completion", [{ ...completedState(), latestTime: "2026-08-16T12:05:01.000Z" }]],
    ["missing start timestamp", [{ ...completedState(), lastStartedAt: null }]],
    ["missing completion timestamp", [{ ...completedState(), lastCompletedAt: null }]],
    ["completion before start", [{ ...completedState(), lastCompletedAt: new Date(startedAt.getTime() - 1) }]],
    ["recorded failure", [{ ...completedState(), lastError: "sync failed" }]],
    ["active lease", [{ ...completedState(), lockedAt: completedAt, lockToken: "lease" }]]
  ])("fails closed for production when sync evidence has %s", async (_case, states) => {
    prisma.squareCatalogSyncState.findMany.mockResolvedValue(states);
    const source = await loadStore("production");

    await expect(source.readPostgresCatalogSummary()).resolves.toEqual({
      available: false,
      environment: null,
      itemCount: 2,
      variationCount: 3,
      updatedAt: null
    });
  });

  it("fails closed when catalog completion is older than the default 24-hour maximum", async () => {
    prisma.squareCatalogSyncState.findMany.mockResolvedValue([{
      ...completedState(),
      lastStartedAt: new Date("2026-08-15T12:00:00.000Z"),
      lastCompletedAt: new Date("2026-08-15T12:09:59.999Z"),
      latestTime: "2026-08-15T12:09:59.000Z"
    }]);
    const source = await loadStore("production");

    await expect(source.readPostgresCatalogSummary()).resolves.toMatchObject({
      available: false,
      environment: null,
      updatedAt: null
    });
  });

  it("uses the configured catalog maximum age instead of accepting stale evidence", async () => {
    vi.stubEnv("SQUARE_CATALOG_SYNC_MAX_AGE_SECONDS", "240");
    const source = await loadStore("production");

    await expect(source.readPostgresCatalogSummary()).resolves.toMatchObject({
      available: false,
      environment: null,
      updatedAt: null
    });
  });

  it("does not expose catalog products when exact sync evidence is unavailable", async () => {
    prisma.squareCatalogSyncState.findMany.mockResolvedValue([]);
    const source = await loadStore("production");

    await expect(source.readPostgresStorefrontProductsByVariationIds(["variation-1"])).resolves.toEqual([]);
    expect(prisma.storeLocation.findMany).not.toHaveBeenCalled();
    expect(prisma.squareItemVariation.findMany).not.toHaveBeenCalled();
    expect(prisma.squareCatalogObject.findMany).not.toHaveBeenCalled();
  });

  it("does not expose product inventory when the active inventory evidence is stale", async () => {
    vi.stubEnv("SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS", "240");
    prisma.squareCatalogSyncState.findMany
      .mockResolvedValueOnce([completedState()])
      .mockResolvedValueOnce([completedInventoryState()]);
    const source = await loadStore("production");

    await expect(source.readPostgresStorefrontProductsByVariationIds(["variation-1"])).resolves.toEqual([]);
    expect(prisma.storeLocation.findMany).not.toHaveBeenCalled();
    expect(prisma.squareItemVariation.findMany).not.toHaveBeenCalled();
    expect(prisma.squareCatalogObject.findMany).not.toHaveBeenCalled();
  });

  it("accepts exact, fresh production inventory evidence", async () => {
    prisma.squareCatalogSyncState.findMany.mockResolvedValue([completedInventoryState()]);
    prisma.storeLocation.findMany.mockResolvedValue([
      { squareLocationId: "location-1" },
      { squareLocationId: null }
    ]);
    const source = await loadStore("production");

    await expect(source.readPostgresInventorySyncSummary()).resolves.toEqual({
      available: true,
      lastCompletedAt: completedAt.toISOString(),
      latestTime: startedAt.toISOString(),
      totalOperationalLocations: 2,
      mappedOperationalLocations: 1
    });
    expect(prisma.squareCatalogSyncState.findMany).toHaveBeenCalledWith({
      where: { environment: { in: ["sandbox:inventory", "production:inventory"] } },
      select: {
        environment: true,
        latestTime: true,
        lastStartedAt: true,
        lastCompletedAt: true,
        lastError: true,
        lockedAt: true,
        lockToken: true
      }
    });
  });

  it.each([
    ["missing state", []],
    ["wrong active environment", [completedInventoryState("sandbox")]],
    ["mixed environment states", [completedInventoryState(), completedInventoryState("sandbox")]],
    ["missing watermark", [{ ...completedInventoryState(), latestTime: null }]],
    ["invalid watermark", [{ ...completedInventoryState(), latestTime: "not-a-time" }]],
    ["watermark before start", [{ ...completedInventoryState(), latestTime: "2026-08-16T11:59:59.999Z" }]],
    ["watermark after completion", [{ ...completedInventoryState(), latestTime: "2026-08-16T12:05:00.001Z" }]],
    ["missing start timestamp", [{ ...completedInventoryState(), lastStartedAt: null }]],
    ["missing completion timestamp", [{ ...completedInventoryState(), lastCompletedAt: null }]],
    ["completion before start", [{ ...completedInventoryState(), lastCompletedAt: new Date("2026-08-16T11:59:59.999Z") }]],
    ["recorded failure", [{ ...completedInventoryState(), lastError: "sync failed" }]],
    ["lock timestamp without token", [{ ...completedInventoryState(), lockedAt: completedAt }]],
    ["lock token without timestamp", [{ ...completedInventoryState(), lockToken: "lease" }]]
  ])("fails closed and withholds timestamps for inventory with %s", async (_case, states) => {
    prisma.squareCatalogSyncState.findMany.mockResolvedValue(states);
    prisma.storeLocation.findMany.mockResolvedValue([{ squareLocationId: "location-1" }]);
    const source = await loadStore("production");

    await expect(source.readPostgresInventorySyncSummary()).resolves.toEqual({
      available: false,
      lastCompletedAt: null,
      latestTime: null,
      totalOperationalLocations: 1,
      mappedOperationalLocations: 1
    });
  });

  it("rejects inventory older than the configured maximum age", async () => {
    vi.stubEnv("SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS", "240");
    prisma.squareCatalogSyncState.findMany.mockResolvedValue([completedInventoryState()]);
    prisma.storeLocation.findMany.mockResolvedValue([]);
    const source = await loadStore("production");

    await expect(source.readPostgresInventorySyncSummary()).resolves.toMatchObject({
      available: false,
      lastCompletedAt: null,
      latestTime: null
    });
  });

  it("keeps the catalog store surface explicit", async () => {
    const source = await loadStore("production");
    expect(source.readPostgresCatalogSummary).toBeTypeOf("function");
    expect(source.readPostgresInventorySyncSummary).toBeTypeOf("function");
    expect(source.readMappedOperationalStoreLocations).toBeTypeOf("function");
    expect(source.readPostgresStorefrontProductsByVariationIds).toBeTypeOf("function");
  });
});
