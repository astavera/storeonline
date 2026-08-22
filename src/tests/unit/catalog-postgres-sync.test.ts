/**
 * Verifies the isolated behavior of catalog postgres sync.
 */

import { describe, expect, it, vi } from "vitest";
import type { CatalogObject } from "square";
import {
  compactSquareCatalogObject,
  requireReadOnlySquareSyncAllowed,
  SquareProductionSyncDisabledError,
  synchronizeSquareCatalogChanges,
  type SquareCatalogSyncStore
} from "@/server/square/catalog-postgres-sync";

function store(overrides: Partial<SquareCatalogSyncStore> = {}): SquareCatalogSyncStore {
  return {
    acquire: vi.fn().mockResolvedValue({ lockToken: "lease", latestTime: "2026-07-15T10:00:00Z" }),
    persistPage: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe("PostgreSQL Square catalog synchronization", () => {
  it("stores only the Square fields required by the storefront", () => {
    const compactItem = compactSquareCatalogObject({
      id: "item-1",
      type: "ITEM",
      version: 123n,
      imageId: "image-primary",
      customAttributeValues: { enormous: { type: "STRING", stringValue: "do-not-copy" } },
      itemData: {
        name: "Pilot item",
        imageIds: ["image-secondary"],
        isTaxable: false,
        taxIds: ["tax-ny"],
        variations: [{
          id: "variation-nested",
          type: "ITEM_VARIATION",
          itemVariationData: { name: "Nested variation", sku: "NESTED" }
        }]
      }
    } as CatalogObject);

    expect(compactItem).toEqual({
      imageId: "image-primary",
      itemData: {
        imageIds: ["image-secondary"],
        isTaxable: false,
        taxIds: ["tax-ny"]
      }
    });
    expect(JSON.stringify(compactItem)).not.toContain("do-not-copy");
    expect(JSON.stringify(compactItem)).not.toContain("variation-nested");

    expect(compactSquareCatalogObject({
      id: "variation-1",
      type: "ITEM_VARIATION",
      imageId: "variation-image",
      itemVariationData: {
        imageIds: ["variation-image-2"],
        trackInventory: false,
        sku: "SKU-NOT-IN-RAW"
      }
    } as CatalogObject)).toEqual({
      imageId: "variation-image",
      itemVariationData: { imageIds: ["variation-image-2"], trackInventory: false }
    });
  });

  it("stores deleted Square objects as minimal tombstones", () => {
    expect(compactSquareCatalogObject({
      id: "deleted-item",
      type: "ITEM",
      isDeleted: true,
      itemData: { name: "Deleted item", description: "Must not remain in the projection" }
    } as CatalogObject)).toEqual({});
  });

  it("allows Sandbox reads and blocks Production until explicitly approved", () => {
    expect(() => requireReadOnlySquareSyncAllowed("sandbox")).not.toThrow();
    expect(() => requireReadOnlySquareSyncAllowed("production")).toThrow(SquareProductionSyncDisabledError);
    expect(() => requireReadOnlySquareSyncAllowed("production", true)).not.toThrow();
  });

  it("pages from the persisted Square cursor and advances only after persistence", async () => {
    const persistence = store();
    const search = vi.fn()
      .mockResolvedValueOnce({ objects: [{ id: "item-1", type: "ITEM" } as CatalogObject], cursor: "next", latestTime: "2026-07-15T11:00:00Z" })
      .mockResolvedValueOnce({ objects: [], latestTime: "2026-07-15T12:00:00Z" });

    const result = await synchronizeSquareCatalogChanges({ environment: "sandbox", source: { search }, store: persistence });

    expect(search).toHaveBeenNthCalledWith(1, { beginTime: "2026-07-15T10:00:00Z", cursor: undefined });
    expect(search).toHaveBeenNthCalledWith(2, { beginTime: "2026-07-15T10:00:00Z", cursor: "next" });
    expect(persistence.persistPage).toHaveBeenCalledTimes(2);
    expect(persistence.complete).toHaveBeenCalledWith("sandbox", "lease", "2026-07-15T12:00:00Z", expect.any(Date));
    expect(result).toMatchObject({ pages: 2, objects: 1, latestTime: "2026-07-15T12:00:00Z" });
  });

  it("keeps the previous cursor and records a failed run", async () => {
    const persistence = store({ persistPage: vi.fn().mockRejectedValue(new Error("database unavailable")) });
    await expect(synchronizeSquareCatalogChanges({
      environment: "production",
      source: { search: vi.fn().mockResolvedValue({ objects: [], latestTime: "new-time" }) },
      store: persistence
    })).rejects.toThrow("database unavailable");
    expect(persistence.complete).not.toHaveBeenCalled();
    expect(persistence.fail).toHaveBeenCalledWith("production", "lease", expect.any(Error), expect.any(Date));
  });
});
