/**
 * Verifies the narrow terminal-release cleanup policy.
 */

import { describe, expect, it } from "vitest";
import { isShippingOrderAlreadyReleased } from "@/server/checkout/shipping-checkout-cleanup-policy";

describe("shipping checkout cleanup policy", () => {
  it("accepts only the authoritative already-released conflict", () => {
    expect(isShippingOrderAlreadyReleased(new Error("SHIPPING_ORDER_RELEASE_CONFLICT"))).toBe(true);

    expect(isShippingOrderAlreadyReleased(new Error("PAID_ORDER_RELEASE_FORBIDDEN"))).toBe(false);
    expect(isShippingOrderAlreadyReleased(new Error("CHECKOUT_CORRELATION_CONFLICT"))).toBe(false);
    expect(isShippingOrderAlreadyReleased(new Error("SHIPPING_ORDER_RELEASE_CONFLICT_EXTRA"))).toBe(false);
    expect(isShippingOrderAlreadyReleased({ message: "SHIPPING_ORDER_RELEASE_CONFLICT" })).toBe(false);
    expect(isShippingOrderAlreadyReleased("SHIPPING_ORDER_RELEASE_CONFLICT")).toBe(false);
  });
});
