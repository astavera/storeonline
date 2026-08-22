// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/route";

const pickupMocks = vi.hoisted(() => ({
  createSquareHostedCheckout: vi.fn(async (input: unknown) => {
    void input;
    return {
      checkoutUrl: "https://square.link/u/test-checkout",
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "payment-link-1"
    };
  }),
  deleteSquareHostedCheckoutLink: vi.fn(async () => undefined),
  reservePickup: vi.fn(async (input: unknown, options: unknown) => {
    void input;
    void options;
    return {
      replayed: false,
      hold: {
        capacityHoldId: "00000000-0000-4000-8000-000000000601",
        expiresAt: "2026-08-19T15:15:00.000Z"
      }
    };
  }),
  reserveWalkingLocalDelivery: vi.fn(async (input: unknown, options: unknown) => {
    void input;
    void options;
    return {
      replayed: false,
      hold: {
        capacityHoldId: "00000000-0000-4000-8000-000000000611",
        expiresAt: "2026-08-19T15:15:00.000Z"
      }
    };
  }),
  bindCapacityCheckout: vi.fn(async () => ({ changed: true })),
  releaseCapacityCheckout: vi.fn(async () => ({ changed: true })),
  localDeliveryValid: { value: true },
  validatePickup: vi.fn(async () => ({
    valid: true as const,
    availability: {
      quoteId: "00000000-0000-4000-8000-000000000602",
      requestedDate: "2026-08-19"
    },
    slot: {
      id: "pickup-slot-1",
      label: "11:00 AM-12:00 PM",
      startsAt: "2026-08-19T15:00:00.000Z",
      endsAt: "2026-08-19T16:00:00.000Z"
    }
  }))
}));

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
  createSquareHostedCheckout: pickupMocks.createSquareHostedCheckout,
  deleteSquareHostedCheckoutLink: pickupMocks.deleteSquareHostedCheckoutLink
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
    recordCapacityReservation: async () => undefined,
    recordCapacityHostedCheckout: async () => undefined,
    recordHostedCheckout: async () => undefined
  }),
  hashCheckoutRequest: () => "release-guard-request-hash"
}));

vi.mock("@/server/orderpro/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/orderpro/config")>()),
  isOrderProLocalDeliveryCheckoutEnabled: () => true
}));

vi.mock("@/server/orderpro/runtime", () => ({
  getRuntimeOrderProClient: () => ({
    ready: true,
    state: "READY",
    client: {
      reservePickup: pickupMocks.reservePickup,
      reserveWalkingLocalDelivery: pickupMocks.reserveWalkingLocalDelivery,
      bindCapacityCheckout: pickupMocks.bindCapacityCheckout,
      releaseCapacityCheckout: pickupMocks.releaseCapacityCheckout
    }
  })
}));

vi.mock("@/server/orderpro/shipping-order-client", () => ({
  orderProShippingCommandIdentity: (action: string, attemptId: string, suffix?: string) =>
    `${action}:${attemptId}${suffix ? `:${suffix}` : ""}`,
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
  validateOrderProLocalDeliverySelection: async () => pickupMocks.localDeliveryValid.value ? ({
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
  }) : ({
    valid: false,
    message: "The local delivery quote or time slot is no longer valid."
  })
}));

vi.mock("@/server/orderpro/orderpro-pickup-slot-service", () => ({
  validateOrderProPickupSelection: pickupMocks.validatePickup
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
    quoteShippingCart: async () => ({
      errors: [],
      compatibleFulfillmentModes: ["shipping"]
    }),
    validateShippingSelection: async (input: { selection: Record<string, unknown> }) => input.selection
  };
});

function checkoutRequest(
  fulfillmentMode: "pickup" | "local-delivery" | "shipping",
  options: { omitPickup?: boolean } = {}
) {
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
      ...(fulfillmentMode === "pickup" && !options.omitPickup
        ? {
            pickup: {
              quoteId: "00000000-0000-4000-8000-000000000602",
              requestedDate: "2026-08-19",
              slotId: "pickup-slot-1",
              slotLabel: "11:00 AM-12:00 PM"
            }
          }
        : {}),
      ...(fulfillmentMode === "local-delivery"
        ? {
            localDelivery: {
              quoteRequestId: "00000000-0000-4000-8000-000000000612",
              quoteId: "quote-release-guard",
              slotId: "slot-release-guard",
              feeCents: 1299,
              requestedDate: "2026-07-25",
              requestAddress: {
                line1: "123 Test Street",
                city: "New York",
                state: "NY",
                postalCode: "10028",
                country: "US"
              },
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
  beforeEach(() => {
    vi.clearAllMocks();
    pickupMocks.localDeliveryValid.value = true;
  });

  it("creates a secure Square redirect only after OrderPRO revalidates delivery", async () => {
    const response = await POST(checkoutRequest("local-delivery"));
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "redirect_to_square",
      checkoutUrl: "https://square.link/u/test-checkout",
      paymentCaptured: false,
      squareOrderCreated: true
    });
    expect(pickupMocks.reserveWalkingLocalDelivery).toHaveBeenCalledOnce();
    expect(pickupMocks.bindCapacityCheckout).toHaveBeenCalledOnce();
    expect(pickupMocks.createSquareHostedCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentMode: "local-delivery",
        orderProCapacityHoldId: "00000000-0000-4000-8000-000000000611"
      })
    );
  });

  it.each(["pickup", "shipping"] as const)("creates a secure Square redirect for the existing %s flow", async (fulfillmentMode) => {
    const response = await POST(checkoutRequest(fulfillmentMode));
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "redirect_to_square",
      checkoutUrl: "https://square.link/u/test-checkout",
      paymentCaptured: false,
      squareOrderCreated: true
    });
    expect(body.status).not.toBe("local_delivery_not_available");
  });

  it("does not contact OrderPRO reservations or Square when Pickup has no slot", async () => {
    const response = await POST(checkoutRequest("pickup", { omitPickup: true }));

    expect(response.status).toBe(400);
    expect(pickupMocks.validatePickup).not.toHaveBeenCalled();
    expect(pickupMocks.reservePickup).not.toHaveBeenCalled();
    expect(pickupMocks.createSquareHostedCheckout).not.toHaveBeenCalled();
  });

  it("revalidates Pickup and never creates Square checkout for an expired slot", async () => {
    pickupMocks.validatePickup.mockResolvedValueOnce({
      valid: false,
      message: "The selected Pickup quote or slot expired."
    } as never);

    const response = await POST(checkoutRequest("pickup"));

    expect(response.status).toBe(400);
    expect(pickupMocks.validatePickup).toHaveBeenCalledOnce();
    expect(pickupMocks.reservePickup).not.toHaveBeenCalled();
    expect(pickupMocks.createSquareHostedCheckout).not.toHaveBeenCalled();
  });

  it("releases the OrderPRO Pickup reservation when Square checkout fails", async () => {
    pickupMocks.createSquareHostedCheckout.mockRejectedValueOnce(new Error("Square unavailable"));

    const response = await POST(checkoutRequest("pickup"));

    expect(response.status).toBe(400);
    expect(pickupMocks.reservePickup).toHaveBeenCalledOnce();
    expect(pickupMocks.releaseCapacityCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityHoldId: "00000000-0000-4000-8000-000000000601",
        reason: "CHECKOUT_FAILED"
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String), correlationId: expect.any(String) })
    );
  });

  it("releases the OrderPRO Local Delivery reservation when Square checkout fails", async () => {
    pickupMocks.createSquareHostedCheckout.mockRejectedValueOnce(new Error("Square unavailable"));

    const response = await POST(checkoutRequest("local-delivery"));

    expect(response.status).toBe(400);
    expect(pickupMocks.reserveWalkingLocalDelivery).toHaveBeenCalledOnce();
    expect(pickupMocks.releaseCapacityCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityHoldId: "00000000-0000-4000-8000-000000000611",
        reason: "CHECKOUT_FAILED"
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String), correlationId: expect.any(String) })
    );
  });

  it("stops before reservation and Square when the delivery quote, address, fee or slot is stale", async () => {
    pickupMocks.localDeliveryValid.value = false;

    const response = await POST(checkoutRequest("local-delivery"));

    expect(response.status).toBe(400);
    expect(pickupMocks.reserveWalkingLocalDelivery).not.toHaveBeenCalled();
    expect(pickupMocks.createSquareHostedCheckout).not.toHaveBeenCalled();
  });

  it("does not create Square checkout when Local Delivery capacity is exhausted", async () => {
    pickupMocks.reserveWalkingLocalDelivery.mockRejectedValueOnce(
      new Error("CAPACITY_UNAVAILABLE")
    );

    const response = await POST(checkoutRequest("local-delivery"));

    expect(response.status).toBe(400);
    expect(pickupMocks.createSquareHostedCheckout).not.toHaveBeenCalled();
  });

  it("uses stable OrderPRO and Square identities across an identical retry", async () => {
    await POST(checkoutRequest("pickup"));
    await POST(checkoutRequest("pickup"));

    expect(pickupMocks.reservePickup).toHaveBeenCalledTimes(2);
    expect(pickupMocks.createSquareHostedCheckout).toHaveBeenCalledTimes(2);
    expect(pickupMocks.reservePickup.mock.calls[0]?.[1]).toEqual(
      pickupMocks.reservePickup.mock.calls[1]?.[1]
    );
    expect(pickupMocks.createSquareHostedCheckout.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: "release-guard-pickup"
    });
    expect(pickupMocks.createSquareHostedCheckout.mock.calls[1]?.[0]).toMatchObject({
      idempotencyKey: "release-guard-pickup"
    });
  });
});
