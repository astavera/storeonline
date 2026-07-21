// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/route";

vi.mock("@/server/square/client", () => ({
  getSquareRuntimeConfig: () => ({ environment: "sandbox", hasAccessToken: false, hasApplicationId: false })
}));

vi.mock("@/server/checkout/cart-service", () => ({
  quoteCartFromOperationalCatalog: async () => ({
    errors: [],
    compatibleFulfillmentModes: ["pickup", "local-delivery", "shipping"]
  })
}));

vi.mock("@/server/checkout/checkout-attempt-repository", () => ({
  CheckoutIdempotencyConflictError: class CheckoutIdempotencyConflictError extends Error {},
  getCheckoutAttemptRepository: () => ({
    recordValidation: async () => ({ attemptId: "attempt-release-guard", replayed: false })
  }),
  hashCheckoutRequest: () => "release-guard-request-hash"
}));

vi.mock("@/server/orderpro/config", () => ({
  isOrderProLocalDeliveryCheckoutEnabled: () => false
}));

vi.mock("@/server/orderpro/orderpro-local-delivery-service", () => ({
  isOrderProDeliveryTestMode: () => false,
  validateOrderProLocalDeliverySelection: async () => ({ valid: true, message: "" })
}));

function checkoutRequest(fulfillmentMode: "pickup" | "local-delivery" | "shipping") {
  return new NextRequest("https://store.example/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `release-guard-${fulfillmentMode}`
    },
    body: JSON.stringify({
      items: [{ squareVariationId: "seed-toy-building-set", quantity: 1 }],
      fulfillmentMode,
      locationId: "store-3rd-avenue",
      ...(fulfillmentMode === "local-delivery"
        ? {
            localDelivery: {
              quoteId: "quote-release-guard",
              slotId: "slot-release-guard",
              feeCents: 1299,
              requestedDate: "2026-07-25",
              address: {
                line1: "123 Test Street",
                city: "New York",
                state: "NY",
                postalCode: "10028",
                country: "US"
              }
            }
          }
        : {}),
      customer: {
        name: "Test Customer",
        email: "customer@example.com",
        phone: "2125550100"
      }
    })
  });
}

describe("checkout Local Delivery release guard", () => {
  it("fails closed before payment setup while the OrderPRO flow is unreleased", async () => {
    const response = await POST(checkoutRequest("local-delivery"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      status: "local_delivery_not_available",
      errors: ["Local delivery checkout is not available yet. Please select pickup or shipping."]
    });
  });

  it.each(["pickup", "shipping"] as const)("does not intercept the existing %s flow", async (fulfillmentMode) => {
    const response = await POST(checkoutRequest(fulfillmentMode));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "validation_only",
      paymentCaptured: false,
      squareOrderCreated: false
    });
    expect(body.status).not.toBe("local_delivery_not_available");
  });
});
