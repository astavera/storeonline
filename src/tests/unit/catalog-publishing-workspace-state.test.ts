/**
 * Verifies the isolated behavior of catalog publishing workspace state.
 */

import { describe, expect, it } from "vitest";
import {
  catalogPublishingWorkspaceStorageKey,
  placementsMatch,
  readCatalogPublishingWorkspace,
  writeCatalogPublishingWorkspace
} from "@/features/admin/services/catalog-publishing-workspace-state";
import type { WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";

describe("catalog publishing workspace persistence", () => {
  it("writes a versioned, bounded workspace and reads it back", () => {
    const storage = createStorage();
    writeCatalogPublishingWorkspace(storage, {
      snapshotUpdatedAt: "2026-07-22T12:00:00.000Z",
      queryInput: "balloons",
      query: "balloons",
      squareCategoryId: "square-balloons",
      squareVendorId: "vendor-party",
      websiteCategoryId: "website-balloons",
      imageFilter: "with",
      page: 4,
      selectedId: "variation-1",
      selectedIds: Array.from({ length: 5_100 }, (_, index) => `variation-${index}`),
      draft: placement("variation-1", ["website-balloons"]),
      draftBaseline: placement("variation-1", []),
      listScrollTop: 240
    }, 10_000);

    const restored = readCatalogPublishingWorkspace(storage, 10_001);

    expect(restored).toMatchObject({
      version: 1,
      savedAt: 10_000,
      query: "balloons",
      page: 4,
      listScrollTop: 240
    });
    expect(restored?.selectedIds).toHaveLength(5_000);
    expect(storage.getItem(catalogPublishingWorkspaceStorageKey)?.length).toBeLessThanOrEqual(1_000_000);
  });

  it("removes expired or incompatible workspaces", () => {
    const storage = createStorage();
    storage.setItem(catalogPublishingWorkspaceStorageKey, JSON.stringify({ version: 2, savedAt: 1 }));
    expect(readCatalogPublishingWorkspace(storage, 2)).toBeNull();
    expect(storage.getItem(catalogPublishingWorkspaceStorageKey)).toBeNull();

    writeCatalogPublishingWorkspace(storage, emptyWorkspace(), 1);
    expect(readCatalogPublishingWorkspace(storage, 8 * 24 * 60 * 60 * 1_000)).toBeNull();
    expect(storage.getItem(catalogPublishingWorkspaceStorageKey)).toBeNull();
  });

  it("compares placement baselines independently of selection order", () => {
    const left = placement("variation-1", ["category-a", "category-b"]);
    const right = placement("variation-1", ["category-b", "category-a"]);
    expect(placementsMatch(left, right)).toBe(true);
    expect(placementsMatch(left, { ...right, visible: true })).toBe(false);
  });
});

function emptyWorkspace() {
  return {
    snapshotUpdatedAt: null,
    queryInput: "",
    query: "",
    squareCategoryId: "",
    squareVendorId: "",
    websiteCategoryId: "",
    imageFilter: "all" as const,
    page: 1,
    selectedId: "",
    selectedIds: [],
    draft: null,
    draftBaseline: null,
    listScrollTop: 0
  };
}

function placement(squareVariationId: string, categoryIds: string[]): WebsiteProductPlacement {
  return {
    squareVariationId,
    categoryIds,
    brandIds: [],
    holidayAssignments: [],
    ageGroups: [],
    fulfillmentModes: [],
    surfaceIds: [],
    visible: false,
    sortOrder: 0
  };
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
}
