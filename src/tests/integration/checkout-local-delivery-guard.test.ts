// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/route";

vi.mock("@/server/square/client", () => ({
  getSquareRuntimeConfig: () => ({ environment: "sandbox", hasAccessToken: false, hasApplicationId: false })
}));

vi.mock("@/server/square/postgres-catalog-store", () => ({
  readMappedOperationalStoreLocations: async () => [{
    id: "store-3rd-avenue",
    squareLocationId: "square-location-3rd-avenue"
  }]
}));

vi.mock("@/server/square/hosted-checkout", () => ({
  SquareCheckoutUnavailableError: class SquareCheckoutUnavailableError extends Error {},
  createSquareHostedCheckout: async () => ({
    checkoutUrl: "https://square.link/u/test-checkout",
    squareOrderId: "square-order-1",
    squarePaymentLinkId: "payment-link-1"
  })
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
    recordValidation: async () => ({ attemptId: "attempt-release-guard", replayed: false }),
    recordShippingReservation: async () => undefined,
    recordHostedCheckout: async () => undefined
  }),
  hashCheckoutRequest: () => "release-guard-request-hash"
}));

vi.mock("@/server/orderpro/config", () => ({
  isOrderProLocalDeliveryCheckoutEnabled: () => true
}));

vi.mock("@/server/orderpro/shipping-order-client", () => ({
  getOrderProShippingOrderClient: () => ({
    create: async () => ({
      replayed: false,
      order: { id: "00000000-0000-4000-8000-000000000501" }
    }),
    bind: async () => ({ changed: true }),
    release: async () => ({ changed: true })
  })
}));

vi.mock("@/server/orderpro/orderpro-local-delivery-service", () => ({
  isOrderProDeliveryTestMode: () => false,
  validateOrderProLocalDeliverySelection: async () => ({
    valid: true,
    quote: {
      eligible: true,
      source: "ORDERPRO",
      quoteId: "quote-release-guard",
      requestedDate: "2026-07-25",
      normalizedAddress: {
        line1: "123 Test Street",
        city: "New York",
        state: "NY",
        postalCode: "10028",
        country: "US"
      },
      selectedLocationId: "store-3rd-avenue",
      selectedLocationName: "3rd Avenue Store",
      assignmentRule: "FIXED_POSTAL_ZONE",
      walkingDistanceFeet: 1000,
      walkingDurationMinutes: 10,
      estimatedRoundTripMinutes: 28,
      feeCents: 1299,
      currency: "USD",
      feeTierId: "delivery-fee",
      availableSlots: [{
        id: "slot-release-guard",
        startsAt: "2026-07-25T16:00:00.000Z",
        endsAt: "2026-07-25T17:00:00.000Z",
        label: "12:00 PM–1:00 PM"
      }],
      zoneVersionId: "zone-version",
      feePolicyVersionId: "fee-policy-version",
      expiresAt: "2026-07-24T16:00:00.000Z"
    }
  })
}));

vi.mock("@/server/shipping/shipping-service", async () => {
  const { z } = await import("zod");
  return {
    ShippingUnavailableError: class ShippingUnavailableError extends Error {},
    isOrderProShippingCheckoutEnabled: () => true,
    shippingSelectionSchema: z.object({
      quoteToken: z.string(),
      rateId: z.string(),
      amountCents: z.number(),
      carrier: z.string(),
      serviceName: z.string(),
      readyToShipDate: z.string(),
      address: z.object({
        line1: z.string(),
        city: z.string(),
        state: z.string(),
        postalCode: z.string(),
        country: z.literal("US")
      })
    }),
    quoteShippingPilotCart: async () => ({
      errors: [],
      compatibleFulfillmentModes: ["shipping"]
    }),
    validateShippingSelection: async (input: { selection: Record<string, unknown> }) => input.selection
  };
});

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
      ...(fulfillmentMode === "shipping"
        ? {
            shipping: {
              quoteToken: "signed-shipping-quote-token-for-test",
              rateId: "shippo-rate-1",
              amountCents: 558,
              carrier: "USPS",
              serviceName: "Ground Advantage",
              readyToShipDate: "2026-07-27",
              address: {
                line1: "500 E 80th St",
                city: "New York",
                state: "NY",
                postalCode: "10075",
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
  it("creates a secure Square redirect only after OrderPRO revalidates delivery", async () => {
    const response = await POST(checkoutRequest("local-delivery"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "redirect_to_square",
      checkoutUrl: "https://square.link/u/test-checkout",
      paymentCaptured: false,
      squareOrderCreated: true
    });
  });

  it.each(["pickup", "shipping"] as const)("creates a secure Square redirect for the existing %s flow", async (fulfillmentMode) => {
    const response = await POST(checkoutRequest(fulfillmentMode));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "redirect_to_square",
      checkoutUrl: "https://square.link/u/test-checkout",
      paymentCaptured: false,
      squareOrderCreated: true
    });
    expect(body.status).not.toBe("local_delivery_not_available");
  });
});
