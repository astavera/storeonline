/**
 * Verifies the isolated behavior of Square hosted checkout.
 */

import { describe, expect, it } from "vitest";
import type { CartQuote } from "@/server/checkout/cart-service";
import {
  buildSquarePaymentLinkRequest,
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
  checkoutGroups: [{
    id: "regular",
    label: "Store items",
    lines: [],
    itemCount: 2,
    subtotalCents: 2598,
    estimatedTaxCents: 231,
    totalCents: 2829,
    compatibleFulfillmentModes: ["pickup", "shipping"]
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
  it("builds a pickup order from trusted Square variation IDs", () => {
    const request = buildSquarePaymentLinkRequest({
      ...baseInput,
      fulfillmentMode: "pickup"
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
          scheduleType: "ASAP",
          recipient: {
            displayName: "Test Customer",
            emailAddress: "customer@example.com",
            phoneNumber: "2125550100"
          }
        }
      }]
    });
    expect(request.order?.lineItems?.[0]).not.toHaveProperty("basePriceMoney");
    expect(request.prePopulatedData).toBeUndefined();
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

  it("creates one Square order without an API fulfillment for a mixed checkout", () => {
    const mixedQuote: CartQuote = {
      ...quote,
      lines: [
        { ...quote.lines[0], checkoutGroup: "regular" },
        { ...quote.lines[0], squareVariationId: "balloon-variation", department: "Balloons", checkoutGroup: "balloons", quantity: 1, lineTotalCents: 1299 }
      ],
      checkoutGroups: [
        { ...quote.checkoutGroups[0], id: "regular", lines: [{ ...quote.lines[0], checkoutGroup: "regular" }] },
        { ...quote.checkoutGroups[0], id: "balloons", label: "Balloons", itemCount: 1, subtotalCents: 1299, lines: [{ ...quote.lines[0], squareVariationId: "balloon-variation", department: "Balloons", checkoutGroup: "balloons", quantity: 1, lineTotalCents: 1299 }], compatibleFulfillmentModes: ["pickup"] }
      ]
    };
    const request = buildSquarePaymentLinkRequest({
      ...baseInput,
      quote: mixedQuote,
      fulfillmentGroups: [
        { id: "regular", fulfillmentMode: "pickup" },
        {
          id: "balloons",
          fulfillmentMode: "pickup",
          pickup: {
            timing: "SCHEDULED",
            requestedDate: "2026-08-20",
            slotId: "pickup-slot-1",
            slotLabel: "4:00 PM–5:00 PM",
            startsAt: "2026-08-20T16:00:00-04:00",
            endsAt: "2026-08-20T17:00:00-04:00"
          }
        }
      ]
    });

    expect(request.order?.fulfillments).toBeUndefined();
    expect(request.order?.lineItems).toHaveLength(2);
    expect(request.order?.metadata).toMatchObject({
      checkout_version: "2",
      fulfillment_model: "ORDERPRO_SPLIT",
      fulfillment_mode: "split"
    });
  });

  it("uses the OrderPRO paid-checkout pipeline for one explicit fulfillment group", () => {
    const request = buildSquarePaymentLinkRequest({
      ...baseInput,
      fulfillmentGroups: [{ id: "regular", fulfillmentMode: "pickup" }]
    });

    expect(request.order?.metadata).toMatchObject({
      checkout_version: "2",
      fulfillment_model: "ORDERPRO_SPLIT",
      fulfillment_mode: "split",
      fulfillment_groups: "regular:pickup"
    });
  });
});
