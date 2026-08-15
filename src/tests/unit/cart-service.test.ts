/**
 * Verifies the isolated behavior of cart service.
 */

import { describe, expect, it } from "vitest";
import { storefrontProducts } from "@/features/catalog/product-catalog";
import { quoteCart, quoteCartWithProducts } from "@/server/checkout/cart-service";

describe("cart service", () => {
  it("validates storefront products and calculates totals", () => {
    const quote = quoteCart({
      items: [
        { squareVariationId: "seed-toy-building-set", quantity: 2 },
        { squareVariationId: "seed-party-tableware-kit", quantity: 1 }
      ]
    });

    expect(quote.errors).toEqual([]);
    expect(quote.itemCount).toBe(3);
    expect(quote.subtotalCents).toBe(6897);
    expect(quote.totalCents).toBeGreaterThan(quote.subtotalCents);
    expect(quote.compatibleFulfillmentModes).toEqual(["pickup", "local-delivery", "shipping"]);
  });

  it("keeps balloon carts pickup-or-delivery-only and reports unavailable items", () => {
    const quote = quoteCart({
      items: [
        { squareVariationId: "seed-mylar-balloon-pick", quantity: 1 },
        { squareVariationId: "seed-toy-building-set", quantity: 1 }
      ]
    });

    expect(quote.compatibleFulfillmentModes).toEqual(["pickup", "local-delivery"]);
    expect(quote.errors).toEqual([]);

    const unavailable = quoteCart({
      items: [
        { squareVariationId: "seed-mylar-balloon-pick", quantity: 1 },
        { squareVariationId: "missing", quantity: 1 }
      ]
    });

    expect(unavailable.errors).toContain("One or more items in your cart are no longer available. Please update your cart and try again.");
    expect(unavailable.errors.join(" ")).not.toContain("missing");
  });

  it("fails closed when Square price is missing or requested inventory is insufficient", () => {
    const base = storefrontProducts[0];
    const insufficient = quoteCartWithProducts(
      { items: [{ squareVariationId: base.squareVariationId, quantity: 3 }] },
      [{ ...base, inventoryTracked: true, availableQuantity: 2 }]
    );
    const missingPrice = quoteCartWithProducts(
      { items: [{ squareVariationId: base.squareVariationId, quantity: 1 }] },
      [{ ...base, priceAvailable: false }]
    );

    expect(insufficient.errors).toContain("One or more items do not have enough current Square inventory for the requested quantity.");
    expect(insufficient.lines[0]).toMatchObject({ inventoryTracked: true, availableQuantity: 2 });
    expect(missingPrice.errors).toContain("One or more items do not currently have a purchasable Square price.");
    expect(missingPrice.lines).toEqual([]);
  });

  it("limits fulfillment methods to the selected operational store", () => {
    const base = storefrontProducts[0];
    const quote = quoteCartWithProducts(
      { items: [{ squareVariationId: base.squareVariationId, quantity: 1 }], locationId: "store-pickup" },
      [base],
      {
        catalogSource: "postgres",
        inventoryAsOf: "2026-07-15T22:56:06.794Z",
        warnings: [],
        location: {
          id: "store-pickup",
          name: "Pickup Store",
          address: "123 Main St",
          squareLocationId: "square-pickup",
          pickupEnabled: true,
          localDeliveryEnabled: false,
          shippingFulfillmentEnabled: false
        }
      }
    );

    expect(quote.compatibleFulfillmentModes).toEqual(["pickup"]);
    expect(quote).toMatchObject({
      locationId: "store-pickup",
      locationName: "Pickup Store",
      availabilityScope: "selected-location"
    });
  });
});
