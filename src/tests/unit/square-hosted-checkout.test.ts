/**
 * Verifies the isolated behavior of Square hosted checkout.
 */

import type { SquareClient } from "square";
import { describe, expect, it, vi } from "vitest";
import type { CartQuote } from "@/server/checkout/cart-service";
import {
  buildSquarePaymentLinkRequest,
  recoverSquareHostedCheckout,
  SquareCheckoutUnavailableError
} from "@/server/square/hosted-checkout";

const quote: CartQuote = {
  lines: [{
    squareVariationId: "variation-1",
    slug: "test-product",
    name: "Test product",
    department: "Toys",
    imageUrl: "/test.png",
    unitPriceCents: 1299,
    quantity: 2,
    lineTotalCents: 2598,
    fulfillmentModes: ["pickup", "shipping"],
    inventoryTracked: true,
    availableQuantity: 5
  }],
  itemCount: 2,
  subtotalCents: 2598,
  estimatedTaxCents: 231,
  totalCents: 2829,
  compatibleFulfillmentModes: ["pickup", "shipping"],
  fulfillmentLabel: "Pickup, Shipping",
  errors: [],
  warnings: [],
  catalogSource: "postgres",
  inventoryAsOf: "2026-07-22T12:00:00Z",
  locationId: "store-1",
  locationName: "Store 1",
  availabilityScope: "selected-location"
};

const baseInput = {
  attemptId: "attempt-123",
  idempotencyKey: "c8aebd5e-0a73-4af8-95b1-0f3f09790a32",
  squareLocationId: "square-location-1",
  customer: {
    name: "Test Customer",
    email: "customer@example.com",
    phone: "2125550100"
  },
  quote
};

describe("Square hosted checkout", () => {
  it("recovers the unique correlated link after Square rejects an idempotent replay", async () => {
    const input = {
      ...baseInput,
      fulfillmentMode: "pickup" as const,
      orderProCapacityHoldId: "00000000-0000-4000-8000-000000000601",
      pickup: {
        quoteId: "00000000-0000-4000-8000-000000000602",
        requestedDate: "2026-08-19",
        slotId: "pickup-slot-1",
        slotLabel: "11:00 AM-12:00 PM",
        startsAt: "2026-08-19T15:00:00.000Z",
        endsAt: "2026-08-19T16:00:00.000Z"
      }
    };
    const page = {
      data: [{
        id: "payment-link-1",
        version: 1,
        description: "Modern State website checkout attempt-123",
        orderId: "square-order-1",
        url: "https://square.link/u/provider-e2e"
      }],
      hasNextPage: () => false,
      getNextPage: vi.fn()
    };
    const client = {
      checkout: {
        paymentLinks: {
          list: vi.fn(async () => page)
        }
      },
      orders: {
        get: vi.fn(async () => ({
          order: {
            id: "square-order-1",
            locationId: "square-location-1",
            referenceId: "attempt-123",
            metadata: {
              checkout_attempt_id: "attempt-123",
              fulfillment_mode: "pickup"
            }
          }
        }))
      }
    } as unknown as SquareClient;

    await expect(recoverSquareHostedCheckout(input, client)).resolves.toEqual({
      checkoutUrl: "https://square.link/u/provider-e2e",
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "payment-link-1"
    });
    expect(client.orders.get).toHaveBeenCalledWith({ orderId: "square-order-1" });
  });

  it("builds a pickup order from trusted Square variation IDs", () => {
    const request = buildSquarePaymentLinkRequest({
      ...baseInput,
      fulfillmentMode: "pickup",
      orderProCapacityHoldId: "00000000-0000-4000-8000-000000000601",
      pickup: {
        quoteId: "00000000-0000-4000-8000-000000000602",
        requestedDate: "2026-08-19",
        slotId: "pickup-slot-1",
        slotLabel: "11:00 AM-12:00 PM",
        startsAt: "2026-08-19T15:00:00.000Z",
        endsAt: "2026-08-19T16:00:00.000Z"
      }
    });

    expect(request.idempotencyKey).toBe(baseInput.idempotencyKey);
    expect(request.order).toMatchObject({
      locationId: "square-location-1",
      referenceId: "attempt-123",
      lineItems: [{ catalogObjectId: "variation-1", quantity: "2" }],
      pricingOptions: { autoApplyDiscounts: true, autoApplyTaxes: true },
      fulfillments: [{
        type: "PICKUP",
        state: "PROPOSED",
        pickupDetails: {
          scheduleType: "SCHEDULED",
          pickupAt: "2026-08-19T15:00:00.000Z",
          pickupWindowDuration: "PT60M",
          recipient: {
            displayName: "Test Customer",
            emailAddress: "customer@example.com",
            phoneNumber: "2125550100"
          }
        }
      }]
    });
    expect(request.order?.lineItems?.[0]).not.toHaveProperty("basePriceMoney");
    expect(request.order?.metadata).toMatchObject({
      orderpro_quote_id: "00000000-0000-4000-8000-000000000602",
      orderpro_slot_id: "pickup-slot-1",
      orderpro_capacity_hold_id: "00000000-0000-4000-8000-000000000601"
    });
    expect(request.prePopulatedData).toBeUndefined();
  });

  it("fails closed when pickup has no current OrderPRO reservation", () => {
    expect(() => buildSquarePaymentLinkRequest({
      ...baseInput,
      fulfillmentMode: "pickup"
    })).toThrow(SquareCheckoutUnavailableError);
  });

  it("adds the verified Shippo fee and shipment details for shipping checkout", () => {
    const request = buildSquarePaymentLinkRequest({
      ...baseInput,
      fulfillmentMode: "shipping",
      orderProShippingOrderId: "00000000-0000-4000-8000-000000000101",
      shipping: {
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
    });

    expect(request.checkoutOptions?.askForShippingAddress).toBe(true);
    expect(request.checkoutOptions?.shippingFee).toEqual({
      name: "USPS Ground Advantage",
      charge: { amount: 558n, currency: "USD" }
    });
    expect(request.order?.fulfillments).toEqual([
      expect.objectContaining({
        type: "SHIPMENT",
        state: "PROPOSED",
        shipmentDetails: expect.objectContaining({
          carrier: "USPS",
          shippingType: "Ground Advantage",
          recipient: expect.objectContaining({
            address: expect.objectContaining({
              addressLine1: "500 E 80th St",
              postalCode: "10075"
            })
          })
        })
      })
    ]);
    expect(request.prePopulatedData).toBeUndefined();
    expect(request.order?.metadata).toMatchObject({
      orderpro_shipping_order_id: "00000000-0000-4000-8000-000000000101"
    });
  });

  it("fails closed when shipping has no current verified Shippo rate", () => {
    expect(() => buildSquarePaymentLinkRequest({
      ...baseInput,
      fulfillmentMode: "shipping"
    })).toThrow(SquareCheckoutUnavailableError);
  });

  it("adds the verified delivery fee, address, and OrderPRO time window", () => {
    const request = buildSquarePaymentLinkRequest({
      ...baseInput,
      fulfillmentMode: "local-delivery",
      localDelivery: {
        quoteId: "orderpro-preview-quote-123",
        slotId: "delivery-slot-123",
        feeCents: 2500,
        startsAt: "2026-07-24T21:30:00.000Z",
        endsAt: "2026-07-24T22:30:00.000Z",
        address: {
          line1: "500 E 80th St",
          city: "New York",
          state: "NY",
          postalCode: "10075",
          country: "US"
        }
      }
    });

    expect(request.order?.lineItems).toEqual([
      { catalogObjectId: "variation-1", quantity: "2" },
      expect.objectContaining({
        name: "Local delivery",
        quantity: "1",
        basePriceMoney: { amount: 2500n, currency: "USD" }
      })
    ]);
    expect(request.order?.fulfillments).toEqual([
      expect.objectContaining({
        type: "DELIVERY",
        state: "PROPOSED",
        deliveryDetails: expect.objectContaining({
          scheduleType: "SCHEDULED",
          deliverAt: "2026-07-24T21:30:00.000Z",
          deliveryWindowDuration: "PT60M",
          recipient: expect.objectContaining({
            displayName: "Test Customer",
            address: expect.objectContaining({
              addressLine1: "500 E 80th St",
              postalCode: "10075",
              country: "US"
            })
          })
        })
      })
    ]);
    expect(request.order?.metadata).toMatchObject({
      fulfillment_mode: "local-delivery",
      orderpro_quote_id: "orderpro-preview-quote-123",
      orderpro_slot_id: "delivery-slot-123"
    });
    expect(request.prePopulatedData).toBeUndefined();
  });

  it("fails closed when local delivery has no current verified quote", () => {
    expect(() => buildSquarePaymentLinkRequest({
      ...baseInput,
      fulfillmentMode: "local-delivery"
    })).toThrow(SquareCheckoutUnavailableError);
  });
});
