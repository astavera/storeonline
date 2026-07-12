import { describe, expect, it } from "vitest";
import { quoteCart } from "@/server/checkout/cart-service";

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

  it("keeps compatible fulfillment modes and reports unavailable items", () => {
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

    expect(unavailable.errors).toContain("Item missing is no longer available.");
  });
});
