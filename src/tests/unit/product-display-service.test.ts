/**
 * Verifies the isolated behavior of product display service.
 */

import { describe, expect, it } from "vitest";
import { isProductDisplayable } from "@/features/catalog/services/product-display-service";

describe("product display service", () => {
  it("requires visibility, Square variation mapping, and approved fulfillment", () => {
    expect(isProductDisplayable({ webVisible: true, hasSquareVariation: true, hasApprovedFulfillmentMode: true })).toBe(true);
    expect(isProductDisplayable({ webVisible: true, hasSquareVariation: false, hasApprovedFulfillmentMode: true })).toBe(false);
    expect(isProductDisplayable({ webVisible: true, hasSquareVariation: true, hasApprovedFulfillmentMode: false })).toBe(false);
  });
});
