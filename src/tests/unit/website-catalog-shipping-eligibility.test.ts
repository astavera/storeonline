// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { WebsiteMerchandisingConfig } from "@/features/catalog/services/website-merchandising-service";
import { applyProductShippingEligibility } from "@/server/square/website-catalog-store";

const config: WebsiteMerchandisingConfig = {
  version: 3,
  updatedAt: "2026-08-21T12:00:00.000Z",
  categories: [],
  brands: [],
  holidays: [],
  placements: [
    {
      squareVariationId: "ready",
      categoryIds: [],
      brandIds: [],
      holidayAssignments: [],
      ageGroups: [],
      fulfillmentModes: ["pickup", "shipping"],
      surfaceIds: ["shop"],
      visible: true,
      sortOrder: 0
    },
    {
      squareVariationId: "incomplete",
      categoryIds: [],
      brandIds: [],
      holidayAssignments: [],
      ageGroups: [],
      fulfillmentModes: ["local-delivery", "shipping"],
      surfaceIds: ["shop"],
      visible: true,
      sortOrder: 1
    }
  ]
};

describe("website catalog shipping eligibility", () => {
  it("keeps shipping only for products whose physical profile is enabled", () => {
    const result = applyProductShippingEligibility(config, new Map([
      ["ready", { shippingEnabled: true }],
      ["incomplete", { shippingEnabled: false }]
    ]));

    expect(result.placements[0].fulfillmentModes).toEqual(["pickup", "shipping"]);
    expect(result.placements[1].fulfillmentModes).toEqual(["local-delivery"]);
    expect(config.placements[1].fulfillmentModes).toEqual(["local-delivery", "shipping"]);
  });

  it("fails closed when a requested shipping profile is absent", () => {
    const result = applyProductShippingEligibility(config, new Map());
    expect(result.placements.every((placement) => !placement.fulfillmentModes.includes("shipping"))).toBe(true);
  });
});
