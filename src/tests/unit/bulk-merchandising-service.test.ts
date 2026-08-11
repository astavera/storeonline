/**
 * Verifies the isolated behavior of bulk merchandising service.
 */

import { describe, expect, it } from "vitest";
import { applyWebsiteBulkEdit, applyWebsiteBulkEditToVariationIds, type WebsiteBulkEdit } from "@/features/catalog/services/bulk-merchandising-service";
import type { WebsiteCategory, WebsiteHoliday, WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";

const category: WebsiteCategory = {
  id: "category-toys",
  name: "Toys",
  slug: "toys",
  description: "Website toys.",
  imageUrl: "",
  imageAlt: "",
  parentId: null,
  visible: true,
  sortOrder: 0
};

const holiday: WebsiteHoliday = {
  id: "holiday-christmas",
  name: "Christmas",
  slug: "christmas",
  description: "Christmas collection.",
  startDate: "2026-11-01",
  endDate: "2026-12-26",
  visible: true,
  sortOrder: 0
};

describe("bulk merchandising service", () => {
  it("updates several selected products without touching the rest", () => {
    const result = applyWebsiteBulkEdit(
      [placement("one"), placement("two"), placement("three")],
      ["one", "two"],
      edit({
        categoryMode: "add",
        categoryIds: [category.id],
        surfaceMode: "add",
        surfaceIds: ["shop", "search"],
        ageMode: "replace",
        ageGroups: ["5-7"],
        fulfillmentMode: "add",
        fulfillmentModes: ["pickup"]
      }),
      [category],
      []
    );

    expect(result.updatedCount).toBe(2);
    expect(result.placements.slice(0, 2)).toEqual([
      expect.objectContaining({ categoryIds: [category.id], surfaceIds: ["shop", "search"], ageGroups: ["5-7"], fulfillmentModes: ["pickup"], visible: false }),
      expect.objectContaining({ categoryIds: [category.id], surfaceIds: ["shop", "search"], ageGroups: ["5-7"], fulfillmentModes: ["pickup"], visible: false })
    ]);
    expect(result.placements[2]).toEqual(placement("three"));
  });

  it("applies fulfillment to all 291 selected catalog variations", () => {
    const selectedVariationIds = Array.from({ length: 291 }, (_, index) => `play-vehicle-${index + 1}`);
    const result = applyWebsiteBulkEditToVariationIds(
      [],
      selectedVariationIds,
      edit({ fulfillmentMode: "replace", fulfillmentModes: ["pickup", "local-delivery", "shipping"] }),
      [category],
      []
    );

    expect(result).toMatchObject({ createdPlacementCount: 291, updatedCount: 291 });
    expect(result.placements).toHaveLength(291);
    expect(result.placements.every((item) => item.fulfillmentModes.join("|") === "pickup|local-delivery|shipping")).toBe(true);
  });

  it("publishes only selected records that pass every readiness rule", () => {
    const ready = placement("ready", { categoryIds: [category.id], surfaceIds: ["shop"], fulfillmentModes: ["pickup"] });
    const incomplete = placement("incomplete", { categoryIds: [category.id] });
    const result = applyWebsiteBulkEdit([ready, incomplete], ["ready", "incomplete"], edit({ visibilityMode: "publish-ready" }), [category], []);

    expect(result).toMatchObject({ updatedCount: 2, publishedCount: 1, skippedPublishCount: 1 });
    expect(result.placements[0].visible).toBe(true);
    expect(result.placements[1].visible).toBe(false);
  });

  it("does not hide a live product for an empty add or remove operation", () => {
    const live = placement("live", { categoryIds: [category.id], surfaceIds: ["shop"], fulfillmentModes: ["pickup"], visible: true });
    const result = applyWebsiteBulkEdit([live], ["live"], edit({ categoryMode: "add", categoryIds: [] }), [category], []);

    expect(result.placements[0]).toEqual(live);
  });

  it("assigns and removes website brands in bulk", () => {
    const added = applyWebsiteBulkEdit([placement("one"), placement("two")], ["one", "two"], edit({ brandMode: "add", brandIds: ["brand-crayola"] }), [category], []);
    expect(added.placements.map((item) => item.brandIds)).toEqual([["brand-crayola"], ["brand-crayola"]]);

    const removed = applyWebsiteBulkEdit(added.placements, ["one"], edit({ brandMode: "remove", brandIds: ["brand-crayola"] }), [category], []);
    expect(removed.placements.map((item) => item.brandIds)).toEqual([[], ["brand-crayola"]]);
  });

  it("assigns holiday dates and sequential sort order across a selection", () => {
    const result = applyWebsiteBulkEdit(
      [placement("one"), placement("two")],
      ["one", "two"],
      edit({
        holidayMode: "assign",
        holidayId: holiday.id,
        holidayStartsAt: "2026-11-15",
        holidayEndsAt: "2026-12-20",
        sortOrder: 10,
        sortStep: 5
      }),
      [category],
      [holiday]
    );

    expect(result.placements[0]).toMatchObject({ holidayAssignments: [{ holidayId: holiday.id, startsAt: "2026-11-15", endsAt: "2026-12-20" }], surfaceIds: ["holiday-pages"], sortOrder: 10 });
    expect(result.placements[1]).toMatchObject({ holidayAssignments: [{ holidayId: holiday.id, startsAt: "2026-11-15", endsAt: "2026-12-20" }], surfaceIds: ["holiday-pages"], sortOrder: 15 });
  });

  it("creates hidden draft placements for real catalog variations not loaded in the preview", () => {
    const result = applyWebsiteBulkEditToVariationIds(
      [placement("preview-variation")],
      ["preview-variation", "full-catalog-variation"],
      edit({ categoryMode: "add", categoryIds: [category.id] }),
      [category],
      []
    );

    expect(result.createdPlacementCount).toBe(1);
    expect(result.updatedCount).toBe(2);
    expect(result.placements).toEqual([
      expect.objectContaining({ squareVariationId: "preview-variation", categoryIds: [category.id], visible: false }),
      expect.objectContaining({ squareVariationId: "full-catalog-variation", categoryIds: [category.id], visible: false })
    ]);
  });
});

function placement(squareVariationId: string, patch: Partial<WebsiteProductPlacement> = {}): WebsiteProductPlacement {
  return {
    squareVariationId,
    categoryIds: [],
    brandIds: [],
    holidayAssignments: [],
    ageGroups: [],
    fulfillmentModes: [],
    surfaceIds: [],
    visible: false,
    sortOrder: 0,
    ...patch
  };
}

function edit(patch: Partial<WebsiteBulkEdit>): WebsiteBulkEdit {
  return {
    categoryMode: "keep",
    categoryIds: [],
    brandMode: "keep",
    brandIds: [],
    surfaceMode: "keep",
    surfaceIds: [],
    ageMode: "keep",
    ageGroups: [],
    fulfillmentMode: "keep",
    fulfillmentModes: [],
    holidayMode: "keep",
    visibilityMode: "keep",
    ...patch
  };
}
