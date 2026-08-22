/**
 * Verifies the isolated behavior of Square hosted checkout.
 */

import { describe, expect, it, vi } from "vitest";
import type { CartQuote } from "@/server/checkout/cart-service";
import {
  buildSquarePaymentLinkRequest,
  calculateSquareHostedCheckoutOrderPreview,
  type SquareCalculateOrder,
  SquareCheckoutParityError,
  SquareCheckoutUnavailableError
} from "@/server/square/hosted-checkout";

const squareEnvironment = vi.hoisted(() => ({
  SQUARE_CHECKOUT_ENABLED: "true",
  ORDERPRO_SHIPPING_CHECKOUT_ENABLED: "true",
  SQUARE_ACCESS_TOKEN: "sandbox-test-token",
  SQUARE_ENVIRONMENT: "sandbox"
}));

vi.mock("@/lib/validation/env", () => ({ env: squareEnvironment }));

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

const verifiedShipping = {
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
    country: "US" as const
  }
};

const explicitTaxBreakdown = {
  taxQuoteId: "tax-quote-123",
  taxName: "Destination sales tax",
  merchandiseLines: [{
    squareVariationId: "variation-1",
    ratePpm: 88_750,
    taxCents: 231
  }],
  shipping: {
    ratePpm: 88_750,
    taxCents: 50
  },
  totalTaxCents: 281
};

const explicitShippingInput = {
  ...baseInput,
  fulfillmentMode: "shipping" as const,
  orderProShippingOrderId: "00000000-0000-4000-8000-000000000101",
  shipping: verifiedShipping,
  taxApplicationMode: "EXPLICIT_DESTINATION_TAX" as const,
  explicitTaxBreakdown
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
      shipping: verifiedShipping
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
    expect(request.order?.pricingOptions).toEqual({
      autoApplyDiscounts: true,
      autoApplyTaxes: true
    });
    expect(request.order?.serviceCharges).toBeUndefined();
    expect(request.order?.taxes).toBeUndefined();
    expect(request.checkoutOptions?.enableCoupon).toBe(true);
  });

  it("builds explicit SHIPPING tax without automatic tax, discounts, coupons, or shippingFee", () => {
    const request = buildSquarePaymentLinkRequest(explicitShippingInput);

    expect(request.order?.pricingOptions).toEqual({
      autoApplyDiscounts: false,
      autoApplyTaxes: false
    });
    expect(request.checkoutOptions).toMatchObject({
      askForShippingAddress: true,
      enableCoupon: false
    });
    expect(request.checkoutOptions?.shippingFee).toBeUndefined();
    expect(request.order?.lineItems?.[0]).toMatchObject({
      uid: "verified-merchandise-1",
      catalogObjectId: "variation-1",
      quantity: "2",
      appliedTaxes: [{ taxUid: "destination-merchandise-tax-1" }]
    });
    expect(request.order?.taxes).toEqual([
      expect.objectContaining({
        uid: "destination-merchandise-tax-1",
        name: "Destination sales tax",
        type: "ADDITIVE",
        percentage: "8.875",
        scope: "LINE_ITEM",
        metadata: {
          tax_quote_id: "tax-quote-123",
          tax_component: "merchandise"
        }
      }),
      expect.objectContaining({
        uid: "destination-shipping-tax",
        name: "Destination sales tax",
        type: "ADDITIVE",
        percentage: "8.875",
        scope: "LINE_ITEM",
        metadata: {
          tax_quote_id: "tax-quote-123",
          tax_component: "shipping"
        }
      })
    ]);
    expect(request.order?.serviceCharges).toEqual([
      expect.objectContaining({
        uid: "verified-shipping-service-charge",
        name: "USPS Ground Advantage",
        amountMoney: { amount: 558n, currency: "USD" },
        calculationPhase: "SUBTOTAL_PHASE",
        taxable: true,
        appliedTaxes: [{ taxUid: "destination-shipping-tax" }],
        metadata: {
          tax_quote_id: "tax-quote-123",
          tax_component: "shipping",
          shippo_rate_id: "shippo-rate-1"
        }
      })
    ]);
    expect(request.order?.metadata).toMatchObject({
      tax_application_mode: "EXPLICIT_DESTINATION_TAX",
      tax_quote_id: "tax-quote-123"
    });
  });

  it("requires an explicit tax decision for every merchandise line", () => {
    expect(() => buildSquarePaymentLinkRequest({
      ...explicitShippingInput,
      explicitTaxBreakdown: {
        ...explicitTaxBreakdown,
        merchandiseLines: []
      }
    })).toThrow("Every verified cart line requires an explicit tax decision.");
  });

  it("does not permit explicit tax alongside Square catalog automatic tax", () => {
    expect(() => buildSquarePaymentLinkRequest({
      ...explicitShippingInput,
      taxApplicationMode: "SQUARE_CATALOG_AUTO"
    })).toThrow("Explicit tax cannot be combined with Square automatic tax.");
  });

  it("previews the exact explicit SHIPPING order with CalculateOrder without creating an order", async () => {
    const calculateOrder = vi.fn<SquareCalculateOrder>(async ({ order }) => ({
      order: {
        ...order,
        lineItems: order.lineItems?.map((line) => ({
          ...line,
          grossSalesMoney: { amount: 2598n, currency: "USD" as const },
          totalTaxMoney: { amount: 231n, currency: "USD" as const },
          totalMoney: { amount: 2829n, currency: "USD" as const }
        })),
        taxes: order.taxes?.map((tax) => ({ ...tax, autoApplied: false })),
        serviceCharges: order.serviceCharges?.map((serviceCharge) => ({
          ...serviceCharge,
          appliedMoney: { amount: 558n, currency: "USD" as const },
          totalTaxMoney: { amount: 50n, currency: "USD" as const },
          totalMoney: { amount: 608n, currency: "USD" as const }
        })),
        totalTaxMoney: { amount: 281n, currency: "USD" as const },
        totalDiscountMoney: { amount: 0n, currency: "USD" as const },
        totalMoney: { amount: 3437n, currency: "USD" as const }
      }
    }));

    const preview = await calculateSquareHostedCheckoutOrderPreview(
      explicitShippingInput,
      calculateOrder
    );

    expect(calculateOrder).toHaveBeenCalledTimes(1);
    expect(calculateOrder).toHaveBeenCalledWith({
      order: expect.objectContaining({
        locationId: "square-location-1",
        serviceCharges: [expect.objectContaining({ uid: "verified-shipping-service-charge" })]
      })
    });
    expect(preview).toMatchObject({
      merchandiseSubtotalCents: 2598,
      shippingCents: 558,
      merchandiseTaxCents: 231,
      shippingTaxCents: 50,
      totalTaxCents: 281,
      totalCents: 3437
    });
  });

  it("fails closed when CalculateOrder cannot reproduce the verified total", async () => {
    const calculateOrder = vi.fn<SquareCalculateOrder>(async ({ order }) => ({
      order: {
        ...order,
        lineItems: order.lineItems?.map((line) => ({
          ...line,
          grossSalesMoney: { amount: 2598n, currency: "USD" as const },
          totalTaxMoney: { amount: 231n, currency: "USD" as const }
        })),
        taxes: order.taxes,
        serviceCharges: order.serviceCharges?.map((serviceCharge) => ({
          ...serviceCharge,
          appliedMoney: { amount: 558n, currency: "USD" as const },
          totalTaxMoney: { amount: 50n, currency: "USD" as const }
        })),
        totalTaxMoney: { amount: 281n, currency: "USD" as const },
        totalDiscountMoney: { amount: 0n, currency: "USD" as const },
        totalMoney: { amount: 3438n, currency: "USD" as const }
      }
    }));

    await expect(calculateSquareHostedCheckoutOrderPreview(
      explicitShippingInput,
      calculateOrder
    )).rejects.toBeInstanceOf(SquareCheckoutParityError);
  });

  it("does not call CalculateOrder while shipping checkout is disabled", async () => {
    const calculateOrder = vi.fn();
    squareEnvironment.ORDERPRO_SHIPPING_CHECKOUT_ENABLED = "false";
    try {
      await expect(calculateSquareHostedCheckoutOrderPreview(
        explicitShippingInput,
        calculateOrder
      )).rejects.toBeInstanceOf(SquareCheckoutUnavailableError);
      expect(calculateOrder).not.toHaveBeenCalled();
    } finally {
      squareEnvironment.ORDERPRO_SHIPPING_CHECKOUT_ENABLED = "true";
    }
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
