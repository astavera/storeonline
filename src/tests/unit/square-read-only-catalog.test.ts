import type { CatalogObject } from "square";
import { describe, expect, it } from "vitest";
import { normalizeSquareCatalogItem } from "@/server/square/read-only-catalog";

describe("Square read-only catalog normalizer", () => {
  it("preserves item identity, prices, location presence, and sold-out overrides", () => {
    const item: CatalogObject.Item = {
      type: "ITEM",
      id: "item-1",
      presentAtAllLocations: false,
      presentAtLocationIds: ["location-72", "location-86"],
      itemData: {
        name: "Birthday Balloon",
        descriptionPlaintext: "A bright birthday balloon.",
        imageIds: ["image-1"],
        categories: [{ id: "party" }],
        variations: [
          {
            type: "ITEM_VARIATION",
            id: "variation-1",
            presentAtAllLocations: false,
            presentAtLocationIds: ["location-72", "location-86"],
            itemVariationData: {
              itemId: "item-1",
              name: "18 inch",
              sku: "BALLOON-18",
              priceMoney: {
                amount: BigInt(698),
                currency: "USD"
              },
              trackInventory: true,
              sellable: true,
              stockable: true,
              locationOverrides: [
                { locationId: "location-72", soldOut: true },
                { locationId: "location-86", soldOut: false }
              ]
            }
          }
        ]
      }
    };

    expect(normalizeSquareCatalogItem(item)).toMatchObject({
      id: "item-1",
      name: "Birthday Balloon",
      hasDescription: true,
      imageCount: 1,
      categoryIds: ["party"],
      presentAtLocationIds: ["location-72", "location-86"],
      variations: [
        {
          id: "variation-1",
          name: "18 inch",
          priceAmount: "698",
          currency: "USD",
          trackInventory: true,
          soldOutLocationIds: ["location-72"]
        }
      ]
    });
  });

  it("uses safe fallbacks for incomplete catalog records", () => {
    const item: CatalogObject.Item = {
      type: "ITEM",
      id: "item-with-gaps",
      itemData: {
        variations: [
          {
            type: "ITEM_VARIATION",
            id: "variation-with-gaps",
            itemVariationData: {}
          }
        ]
      }
    };

    expect(normalizeSquareCatalogItem(item)).toMatchObject({
      name: "Unnamed item",
      hasDescription: false,
      imageCount: 0,
      variations: [
        {
          name: "Default",
          priceAmount: null,
          currency: null,
          trackInventory: false
        }
      ]
    });
  });
});
