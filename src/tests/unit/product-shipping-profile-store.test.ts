// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/server/db/prisma", () => ({
  getPrismaClient: () => ({ $queryRaw: mocks.queryRaw })
}));

import {
  productShippingProfileInputSchema,
  readProductShippingProfile,
  saveProductShippingProfile
} from "@/server/products/product-shipping-profile-store";

const placement: WebsiteProductPlacement = {
  squareVariationId: "variation-a",
  categoryIds: ["toys"],
  brandIds: [],
  holidayAssignments: [],
  ageGroups: [],
  fulfillmentModes: ["pickup", "shipping"],
  surfaceIds: ["shop"],
  visible: true,
  sortOrder: 0
};

beforeEach(() => vi.clearAllMocks());

describe("product shipping profile store", () => {
  it("normalizes an unconfigured database profile for incremental editing", async () => {
    mocks.queryRaw.mockResolvedValue([{
      squareVariationId: "variation-a",
      configured: false,
      isShippable: true,
      packageLengthIn: null,
      packageWidthIn: null,
      packageHeightIn: null,
      packageWeightLb: null,
      shippingEnabled: false
    }]);

    await expect(readProductShippingProfile("variation-a")).resolves.toEqual({
      configured: false,
      isShippable: true,
      packageLengthIn: "",
      packageWidthIn: "",
      packageHeightIn: "",
      packageWeightLb: "",
      shippingEnabled: false
    });
  });

  it("sends placement-derived eligibility and complete package data through the narrow routine", async () => {
    mocks.queryRaw.mockResolvedValue([{
      squareVariationId: "variation-a",
      configured: true,
      isShippable: true,
      packageLengthIn: "10.000",
      packageWidthIn: "5.000",
      packageHeightIn: "4.000",
      packageWeightLb: "0.750",
      shippingEnabled: true
    }]);

    await expect(saveProductShippingProfile(placement, {
      isShippable: true,
      packageLengthIn: "10",
      packageWidthIn: "5",
      packageHeightIn: "4",
      packageWeightLb: "0.75"
    })).resolves.toMatchObject({ configured: true, shippingEnabled: true });

    const sql = mocks.queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values.slice(0, 6)).toEqual(["variation-a", true, true, false, true, true]);
    expect(sql.values.slice(6).map(String)).toEqual(["10", "5", "4", "0.75"]);
  });

  it("accepts empty fields for draft entry but rejects non-positive or over-precise values", () => {
    expect(productShippingProfileInputSchema.parse({
      isShippable: true,
      packageLengthIn: "",
      packageWidthIn: "",
      packageHeightIn: "",
      packageWeightLb: ""
    }).packageWeightLb).toBe("");
    expect(() => productShippingProfileInputSchema.parse({
      isShippable: true,
      packageLengthIn: "0",
      packageWidthIn: "1",
      packageHeightIn: "1",
      packageWeightLb: "1"
    })).toThrow();
    expect(() => productShippingProfileInputSchema.parse({
      isShippable: true,
      packageLengthIn: "1.0001",
      packageWidthIn: "1",
      packageHeightIn: "1",
      packageWeightLb: "1"
    })).toThrow();
    expect(() => productShippingProfileInputSchema.parse({
      isShippable: true,
      packageLengthIn: "1",
      packageWidthIn: "1",
      packageHeightIn: "1",
      packageWeightLb: "1",
      shippingEnabled: true
    })).toThrow();
  });
});
