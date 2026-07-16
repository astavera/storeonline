import { describe, expect, it, vi } from "vitest";
import type { InventoryCount } from "square";
import {
  normalizeSquareInventoryCount,
  synchronizeSquareInventoryCounts,
  type SquareInventorySyncStore
} from "@/server/square/inventory-postgres-sync";

function store(overrides: Partial<SquareInventorySyncStore> = {}): SquareInventorySyncStore {
  return {
    acquire: vi.fn().mockResolvedValue({ lockToken: "inventory-lease", latestTime: "2026-07-15T10:00:00Z" }),
    persistPage: vi.fn().mockImplementation(async (snapshots) => ({ persisted: snapshots.length, skipped: 0 })),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe("PostgreSQL Square inventory synchronization", () => {
  it("normalizes only complete item-variation counts", () => {
    expect(normalizeSquareInventoryCount({
      catalogObjectId: "variation-1",
      catalogObjectType: "ITEM_VARIATION",
      locationId: "location-1",
      state: "IN_STOCK",
      quantity: "4.5",
      calculatedAt: "2026-07-15T12:00:00Z"
    })).toMatchObject({ variationId: "variation-1", squareLocationId: "location-1", quantity: "4.5" });
    expect(normalizeSquareInventoryCount({ catalogObjectType: "ITEM" })).toBeNull();
  });

  it("pages incrementally and advances the cursor only after persistence", async () => {
    const persistence = store();
    const count = {
      catalogObjectId: "variation-1",
      catalogObjectType: "ITEM_VARIATION",
      locationId: "location-1",
      state: "IN_STOCK",
      quantity: "4",
      calculatedAt: "2026-07-15T12:00:00Z"
    } satisfies InventoryCount;
    const search = vi.fn()
      .mockResolvedValueOnce({ counts: [count], cursor: "next" })
      .mockResolvedValueOnce({ counts: [] });
    const now = new Date("2026-07-15T13:00:00Z");

    const result = await synchronizeSquareInventoryCounts({ environment: "production", source: { search }, store: persistence, now });

    expect(search).toHaveBeenNthCalledWith(1, { updatedAfter: "2026-07-15T10:00:00Z", cursor: undefined });
    expect(search).toHaveBeenNthCalledWith(2, { updatedAfter: "2026-07-15T10:00:00Z", cursor: "next" });
    expect(persistence.complete).toHaveBeenCalledWith("production:inventory", "inventory-lease", now.toISOString(), expect.any(Date));
    expect(result).toMatchObject({ pages: 2, received: 1, persisted: 1, skipped: 0 });
  });

  it("preserves the previous cursor and records failed runs", async () => {
    const persistence = store();
    const failure = new Error("Square unavailable");
    await expect(synchronizeSquareInventoryCounts({
      environment: "production",
      source: { search: vi.fn().mockRejectedValue(failure) },
      store: persistence
    })).rejects.toThrow("Square unavailable");
    expect(persistence.complete).not.toHaveBeenCalled();
    expect(persistence.fail).toHaveBeenCalledWith("production:inventory", "inventory-lease", failure, expect.any(Date));
  });
});
