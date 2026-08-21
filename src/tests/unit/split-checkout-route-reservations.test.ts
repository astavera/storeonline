// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  quoteCart: vi.fn(),
  findValidation: vi.fn(),
  findSplitCheckout: vi.fn(),
  recordValidation: vi.fn(),
  recordSplitCheckoutContext: vi.fn(),
  recordSplitHostedCheckout: vi.fn(),
  validatePickup: vi.fn(),
  validateDelivery: vi.fn(),
  reservePickup: vi.fn(),
  reserveDelivery: vi.fn(),
  bindCapacity: vi.fn(),
  releaseCapacity: vi.fn(),
  createSquare: vi.fn(),
  deleteSquare: vi.fn(),
  getCapacityClient: vi.fn()
}));

vi.mock("@/server/checkout/cart-service", () => ({ quoteCartFromOperationalCatalog: mocks.quoteCart }));
vi.mock("@/server/checkout/checkout-attempt-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/checkout/checkout-attempt-repository")>();
  return {
    ...actual,
    getCheckoutAttemptRepository: () => ({
      findValidation: mocks.findValidation,
      findSplitCheckout: mocks.findSplitCheckout,
      recordValidation: mocks.recordValidation,
      recordSplitCheckoutContext: mocks.recordSplitCheckoutContext,
      recordSplitHostedCheckout: mocks.recordSplitHostedCheckout
    })
  };
});
vi.mock("@/server/orderpro/orderpro-pickup-slot-service", () => ({
  validateOrderProPickupSelection: mocks.validatePickup
}));
vi.mock("@/server/orderpro/orderpro-local-delivery-service", () => ({
  isOrderProDeliveryTestMode: () => false,
  validateOrderProLocalDeliverySelection: mocks.validateDelivery
}));
vi.mock("@/server/orderpro/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/orderpro/config")>();
  return { ...actual, isOrderProLocalDeliveryCheckoutEnabled: () => true };
});
vi.mock("@/server/orderpro/storefront-fulfillment-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/orderpro/storefront-fulfillment-client")>();
  return { ...actual, getOrderProStorefrontFulfillmentClient: mocks.getCapacityClient };
});
vi.mock("@/server/orderpro/shipping-order-client", () => ({
  getOrderProShippingOrderClient: () => null,
  orderProShippingCommandIdentity: () => "shipping-command:test"
}));
vi.mock("@/server/shipping/shipping-service", async () => {
  const { z } = await import("zod");
  return {
    isOrderProShippingCheckoutEnabled: () => false,
    quoteShippingCart: mocks.quoteCart,
    shippingSelectionSchema: z.unknown(),
    ShippingUnavailableError: class ShippingUnavailableError extends Error {},
    validateShippingSelection: vi.fn()
  };
});
vi.mock("@/server/square/postgres-catalog-store", () => ({
  readMappedOperationalStoreLocations: async () => [
    { id: "store-3rd-avenue", squareLocationId: "square-third" },
    { id: "store-86th-street", squareLocationId: "square-balloons" }
  ]
}));
vi.mock("@/server/square/hosted-checkout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/square/hosted-checkout")>();
  return {
    ...actual,
    createSquareHostedCheckout: mocks.createSquare,
    deleteSquareHostedCheckoutLink: mocks.deleteSquare
  };
});

import { CheckoutIdempotencyConflictError } from "@/server/checkout/checkout-attempt-repository";
import { OrderProStorefrontFulfillmentError } from "@/server/orderpro/storefront-fulfillment-client";
import { POST } from "@/app/api/checkout/route";

const regularItem = { squareVariationId: "regular-variation", quantity: 1, source: "storefront" as const };
const balloonItem = { squareVariationId: "balloon-variation", quantity: 2, source: "balloons" as const };
const quote = {
  lines: [
    { ...regularItem, name: "Regular", department: "Toys", imageUrl: "/regular.png", unitPriceCents: 1000, lineTotalCents: 1000, checkoutGroup: "regular" as const },
    { ...balloonItem, name: "Balloons", department: "Balloons", imageUrl: "/balloons.png", unitPriceCents: 500, lineTotalCents: 1000, checkoutGroup: "balloons" as const }
  ],
  checkoutGroups: [
    { id: "regular" as const, label: "Regular items", lines: [{ ...regularItem, name: "Regular" }], itemCount: 1, subtotalCents: 1000, estimatedTaxCents: 90, totalCents: 1090, compatibleFulfillmentModes: ["pickup", "local-delivery", "shipping"] },
    { id: "balloons" as const, label: "Balloons", lines: [{ ...balloonItem, name: "Balloons" }], itemCount: 2, subtotalCents: 1000, estimatedTaxCents: 90, totalCents: 1090, compatibleFulfillmentModes: ["pickup", "local-delivery"] }
  ],
  itemCount: 3,
  subtotalCents: 2000,
  estimatedTaxCents: 180,
  taxEstimateIncluded: true,
  totalCents: 2180,
  compatibleFulfillmentModes: ["pickup", "local-delivery", "shipping"],
  fulfillmentLabel: "Split fulfillment",
  errors: [],
  warnings: [],
  locationId: null,
  locationName: null
};

describe("split checkout capacity reservations", () => {
  beforeEach(() => {
    vi.stubEnv("SPLIT_CHECKOUT_ENABLED", "true");
    mocks.quoteCart.mockResolvedValue(quote);
    mocks.findValidation.mockResolvedValue(null);
    mocks.findSplitCheckout.mockResolvedValue(null);
    mocks.recordValidation.mockResolvedValue({ attemptId: "attempt-1", replayed: false, quote, errors: [] });
    mocks.recordSplitCheckoutContext.mockResolvedValue({});
    mocks.recordSplitHostedCheckout.mockResolvedValue({});
    mocks.createSquare.mockResolvedValue({
      checkoutUrl: "https://square.test/checkout",
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "square-link-1"
    });
    mocks.deleteSquare.mockResolvedValue(undefined);
    mocks.reserveDelivery.mockResolvedValue(reservation("20000000-0000-4000-8000-000000000001", "WALKING_LOCAL_DELIVERY", "attempt-1:regular"));
    mocks.reservePickup.mockResolvedValue(reservation("10000000-0000-4000-8000-000000000001", "PICKUP", "attempt-1:balloons"));
    mocks.bindCapacity.mockResolvedValue({ changed: true });
    mocks.releaseCapacity.mockResolvedValue({ changed: true });
    mocks.getCapacityClient.mockReturnValue({
      reservePickup: mocks.reservePickup,
      reserveLocalDelivery: mocks.reserveDelivery,
      bind: mocks.bindCapacity,
      release: mocks.releaseCapacity
    });
    mocks.validateDelivery.mockResolvedValue({ valid: true, quote: deliveryQuote() });
    mocks.validatePickup.mockResolvedValue({
      valid: true,
      availability: { quoteId: "10000000-0000-4000-8000-000000000099" },
      slot: {
        id: "pickup-east_86th_street-2026-08-21-1600",
        label: "4:00 PM–5:00 PM",
        startsAt: "2026-08-21T16:00:00-04:00",
        endsAt: "2026-08-21T17:00:00-04:00"
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("reserves both capacity groups before Square and binds both to the one payment order", async () => {
    const response = await POST(request(mixedBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      checkoutVersion: 2,
      fulfillmentModel: "orderpro_split",
      squareOrderId: "square-order-1"
    });
    expect(mocks.reserveDelivery).toHaveBeenCalledWith(expect.objectContaining({ checkoutAttemptId: "attempt-1:regular" }));
    expect(mocks.reservePickup).toHaveBeenCalledWith(expect.objectContaining({ checkoutAttemptId: "attempt-1:balloons" }));
    expect(mocks.reserveDelivery.mock.invocationCallOrder[0]).toBeLessThan(mocks.createSquare.mock.invocationCallOrder[0]);
    expect(mocks.reservePickup.mock.invocationCallOrder[0]).toBeLessThan(mocks.createSquare.mock.invocationCallOrder[0]);
    expect(mocks.recordSplitHostedCheckout.mock.invocationCallOrder[0]).toBeLessThan(mocks.bindCapacity.mock.invocationCallOrder[0]);
    expect(mocks.bindCapacity).toHaveBeenCalledTimes(2);
    expect(mocks.bindCapacity).toHaveBeenCalledWith(expect.objectContaining({
      squareOrderId: "square-order-1",
      squareLocationId: "square-balloons"
    }));
    expect(mocks.recordSplitCheckoutContext).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        groups: expect.arrayContaining([
          expect.objectContaining({ id: "regular", orderProCapacityHoldId: "20000000-0000-4000-8000-000000000001" }),
          expect.objectContaining({ id: "balloons", orderProCapacityHoldId: "10000000-0000-4000-8000-000000000001" })
        ])
      })
    }));
  });

  it("replays the persisted checkout without reserving capacity or creating another Square link", async () => {
    const firstResponse = await POST(request(mixedBody()));
    const first = await firstResponse.json();
    expect(firstResponse.status).toBe(200);

    mocks.findValidation.mockResolvedValue({
      attemptId: "attempt-1",
      idempotencyKey: "checkout-key-123",
      requestHash: "stored-hash",
      replayed: true,
      quote,
      errors: []
    });
    mocks.findSplitCheckout.mockResolvedValue({
      attemptId: "attempt-1",
      requestHash: "stored-hash",
      quote,
      expiresAt: new Date(Date.now() + 60_000),
      checkoutVersion: 2,
      context: {},
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "square-link-1",
      checkoutUrl: "https://square.test/checkout"
    });

    const replayResponse = await POST(request(mixedBody()));
    const replay = await replayResponse.json();

    expect(replayResponse.status).toBe(200);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(mocks.createSquare).toHaveBeenCalledTimes(1);
    expect(mocks.reserveDelivery).toHaveBeenCalledTimes(1);
    expect(mocks.reservePickup).toHaveBeenCalledTimes(1);
    expect(mocks.recordSplitCheckoutContext).toHaveBeenCalledTimes(1);
    expect(mocks.recordSplitHostedCheckout).toHaveBeenCalledTimes(1);
  });

  it("returns 409 before any side effect when an idempotency key has a different request hash", async () => {
    mocks.findValidation.mockRejectedValueOnce(new CheckoutIdempotencyConflictError());

    const response = await POST(request(mixedBody()));

    expect(response.status).toBe(409);
    expect(mocks.quoteCart).not.toHaveBeenCalled();
    expect(mocks.reserveDelivery).not.toHaveBeenCalled();
    expect(mocks.reservePickup).not.toHaveBeenCalled();
    expect(mocks.createSquare).not.toHaveBeenCalled();
  });

  it("rejects balloon shipping even if a forged catalog quote advertises it", async () => {
    const forgedQuote = {
      ...quote,
      checkoutGroups: quote.checkoutGroups.map((group) => group.id === "balloons"
        ? { ...group, compatibleFulfillmentModes: ["pickup", "local-delivery", "shipping"] }
        : group)
    };
    mocks.quoteCart.mockResolvedValue(forgedQuote);
    mocks.recordValidation.mockImplementationOnce(async (input) => ({
      attemptId: "attempt-balloon-shipping",
      replayed: false,
      quote: input.quote,
      errors: input.errors
    }));
    const response = await POST(request({
      version: 2,
      items: [regularItem, balloonItem],
      fulfillmentGroups: [
        {
          id: "regular",
          fulfillmentMode: "pickup",
          locationId: "store-3rd-avenue",
          pickup: { timing: "ASAP" }
        },
        {
          id: "balloons",
          fulfillmentMode: "shipping",
          locationId: "store-86th-street",
          shipping: {
            quoteToken: "forged-shipping-token",
            rateId: "forged-rate",
            amountCents: 500,
            carrier: "USPS",
            serviceName: "Ground Advantage",
            readyToShipDate: "2026-08-21",
            address: { line1: "350 5th Ave", city: "New York", state: "NY", postalCode: "10118", country: "US" }
          }
        }
      ],
      customer: { name: "Jane Customer", email: "jane@example.com", phone: "2125550100" }
    }));
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.errors).toContain("Balloons cannot be shipped.");
    expect(mocks.createSquare).not.toHaveBeenCalled();
    expect(mocks.reserveDelivery).not.toHaveBeenCalled();
    expect(mocks.reservePickup).not.toHaveBeenCalled();
  });

  it("releases the first hold and never creates Square when the second reservation fails", async () => {
    mocks.reservePickup.mockRejectedValueOnce(new OrderProStorefrontFulfillmentError("CAPACITY_HOLD_FAILED", 409));

    const response = await POST(request(mixedBody()));

    expect(response.status).toBe(422);
    expect(mocks.createSquare).not.toHaveBeenCalled();
    expect(mocks.releaseCapacity).toHaveBeenCalledOnce();
    expect(mocks.releaseCapacity).toHaveBeenCalledWith(expect.objectContaining({
      capacityHoldId: "20000000-0000-4000-8000-000000000001",
      reason: "CHECKOUT_FAILED"
    }));
  });

  it("routes a one-group ASAP checkout through the same paid-checkout v2 correlation", async () => {
    const oneGroupQuote = {
      ...quote,
      lines: [quote.lines[0]],
      checkoutGroups: [quote.checkoutGroups[0]],
      itemCount: 1,
      subtotalCents: 1000,
      estimatedTaxCents: 90,
      totalCents: 1090
    };
    mocks.quoteCart.mockResolvedValue(oneGroupQuote);
    mocks.recordValidation.mockResolvedValue({ attemptId: "attempt-single", replayed: false, quote: oneGroupQuote, errors: [] });

    const response = await POST(request({
      version: 2,
      items: [regularItem],
      fulfillmentGroups: [{
        id: "regular",
        fulfillmentMode: "pickup",
        locationId: "store-3rd-avenue",
        pickup: { timing: "ASAP" }
      }],
      customer: { name: "Jane Customer", email: "jane@example.com", phone: "2125550100" }
    }));

    expect(response.status).toBe(200);
    expect(mocks.quoteCart).toHaveBeenNthCalledWith(1, { items: [regularItem] }, {
      orderProShippingCheckoutGroups: []
    });
    expect(mocks.quoteCart).toHaveBeenNthCalledWith(2, {
      items: [regularItem],
      locationId: "store-3rd-avenue"
    }, {});
    expect(mocks.getCapacityClient).not.toHaveBeenCalled();
    expect(mocks.recordSplitCheckoutContext).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ groups: [expect.objectContaining({ id: "regular", pickup: { timing: "ASAP" } })] })
    }));
  });

  it("uses OrderPRO inventory authority for shipping without changing pickup validation", async () => {
    const oneGroupQuote = {
      ...quote,
      lines: [quote.lines[0]],
      checkoutGroups: [quote.checkoutGroups[0]],
      itemCount: 1,
      subtotalCents: 1000,
      estimatedTaxCents: 90,
      totalCents: 1090
    };
    mocks.quoteCart.mockResolvedValue(oneGroupQuote);

    const response = await POST(request({
      version: 2,
      items: [regularItem],
      fulfillmentGroups: [{
        id: "regular",
        fulfillmentMode: "shipping",
        locationId: "store-3rd-avenue",
        shipping: {
          quoteToken: "shipping-token",
          rateId: "shipping-rate",
          amountCents: 657,
          carrier: "USPS",
          serviceName: "Ground Advantage",
          readyToShipDate: "2026-08-21",
          address: { line1: "350 5th Ave", city: "New York", state: "NY", postalCode: "10118", country: "US" }
        }
      }],
      customer: { name: "Jane Customer", email: "jane@example.com", phone: "2125550100" }
    }));

    expect(response.status).toBe(400);
    expect(mocks.quoteCart).toHaveBeenNthCalledWith(1, { items: [regularItem] }, {
      orderProShippingCheckoutGroups: ["regular"]
    });
    expect(mocks.quoteCart).toHaveBeenNthCalledWith(2, {
      items: [regularItem],
      locationId: "store-3rd-avenue"
    }, {
      orderProShippingCheckoutGroups: ["regular"]
    });
    expect(mocks.createSquare).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new NextRequest("https://storefront.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "checkout-key-123" },
    body: JSON.stringify(body)
  });
}

function mixedBody() {
  return {
    version: 2,
    items: [regularItem, balloonItem],
    fulfillmentGroups: [
      {
        id: "regular",
        fulfillmentMode: "local-delivery",
        locationId: "store-3rd-avenue",
        localDelivery: {
          quoteId: "20000000-0000-4000-8000-000000000099",
          slotId: "delivery-third_avenue-2026-08-21-1600",
          feeCents: 2500,
          requestedDate: "2026-08-21",
          address: { line1: "500 E 80th St", city: "New York", state: "NY", postalCode: "10075", country: "US" }
        }
      },
      {
        id: "balloons",
        fulfillmentMode: "pickup",
        locationId: "store-86th-street",
        pickup: { timing: "SCHEDULED", requestedDate: "2026-08-21", slotId: "pickup-east_86th_street-2026-08-21-1600", slotLabel: "4:00 PM–5:00 PM" }
      }
    ],
    customer: { name: "Jane Customer", email: "jane@example.com", phone: "2125550100" }
  };
}

function deliveryQuote() {
  return {
    eligible: true as const,
    source: "ORDERPRO" as const,
    quoteId: "20000000-0000-4000-8000-000000000099",
    requestedDate: "2026-08-21",
    normalizedAddress: { line1: "500 EAST 80 STREET", city: "New York", state: "NY", postalCode: "10075", country: "US" as const },
    selectedLocationId: "store-3rd-avenue",
    selectedLocationName: "3rd Avenue Store",
    assignmentRule: "NEAREST_WALKING_ROUTE" as const,
    walkingDistanceFeet: 4261,
    walkingDurationMinutes: 17,
    estimatedRoundTripMinutes: 42,
    feeCents: 2500,
    currency: "USD" as const,
    feeTierId: "fee-25",
    availableSlots: [{
      id: "delivery-third_avenue-2026-08-21-1600",
      startsAt: "2026-08-21T16:00:00-04:00",
      endsAt: "2026-08-21T17:00:00-04:00",
      label: "4:00 PM–5:00 PM"
    }],
    zoneVersionId: "zone-v1",
    feePolicyVersionId: "fee-v1",
    expiresAt: "2026-08-21T15:15:00-04:00"
  };
}

function reservation(capacityHoldId: string, fulfillmentMode: "PICKUP" | "WALKING_LOCAL_DELIVERY", checkoutAttemptId: string) {
  return {
    ok: true,
    replayed: false,
    checkoutAttemptId,
    fulfillmentMode,
    hold: { capacityHoldId }
  };
}
