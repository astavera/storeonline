/**
 * Verifies the isolated behavior of product placement service.
 */

import { describe, expect, it } from "vitest";
import { normalizePlacement, productNeedsPlacement, productNeedsReview, suggestPlacements } from "@/features/catalog/services/product-placement-service";

describe("product placement service", () => {
  it("suggests placement without publishing automatically", () => {
    const suggestions = suggestPlacements({
      productName: "Graduation Mylar Balloon",
      squareCategory: "Party Supplies"
    });

    expect(suggestions.map((suggestion) => suggestion.placementTargetSlug)).toEqual(expect.arrayContaining(["mylar", "graduation"]));
    expect(suggestions.every((suggestion) => suggestion.suggestOnly)).toBe(true);
  });

  it("normalizes a placement as hidden until admin approves visibility", () => {
    const placement = normalizePlacement({
      squareVariationId: "VARIATION",
      placementType: "DEPARTMENT",
      placementTargetSlug: "toys",
      sectionId: "toys.product-grid"
    });

    expect(placement.visible).toBe(false);
    expect(placement.sortOrder).toBe(0);
  });

  it("flags products that lack required website publishing inputs", () => {
    expect(productNeedsPlacement([{ visible: false }])).toBe(true);
    expect(productNeedsReview({ hasPlacement: true, hasDescription: false, hasImage: true, hasFulfillmentRules: true })).toBe(true);
  });
});
