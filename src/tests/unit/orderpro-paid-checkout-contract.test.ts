/** Verifies the paid split-checkout boundary consumed by OrderPRO. */

import { describe, expect, it, vi } from "vitest";
import { orderProPaidCheckoutSchema, type OrderProPaidCheckout } from "@/features/checkout/orderpro-paid-checkout-contract";
import {
  createOrderProPaidCheckoutClient,
  getOrderProPaidCheckoutClient
} from "@/server/orderpro/paid-checkout-client";

const paidCheckout: OrderProPaidCheckout = {
  schemaVersion: "orderpro.paid-checkout.v1",
  checkoutAttemptId: "checkout-attempt-123",
  square: {
    orderId: "square-order-123",
    paymentId: "square-payment-123",
    locationId: "square-location-123",
    paidAt: "2026-08-19T15:00:00Z"
  },
  customer: { name: "Test Customer", email: "test@example.com", phone: "2125550100" },
  currency: "USD",
  pricing: {
    merchandiseSubtotalCents: 8000,
    fulfillmentFeesCents: 0,
    discountCents: 0,
    taxCents: 710,
    totalPaidCents: 8710
  },
  groups: [{
    id: "regular",
    fulfillmentMode: "pickup",
    locationId: "store-86th-street",
    squareLocationId: "square-location-123",
    items: [{ squareVariationId: "variation-1", name: "Party item", quantity: 1 }],
    pricing: { merchandiseSubtotalCents: 8000, fulfillmentFeeCents: 0, taxCents: 710 },
    pickup: { timing: "ASAP" }
  }]
};

describe("OrderPRO paid checkout contract", () => {
  it("uses a dedicated production checkout base URL instead of the preview URL", () => {
    expect(getOrderProPaidCheckoutClient({
      ORDERPRO_STOREFRONT_PREVIEW_BASE_URL: "https://preview-orderpro.example",
      ORDERPRO_STOREFRONT_CHECKOUT_SHARED_SECRET: "x".repeat(32)
    })).toBeNull();
    expect(getOrderProPaidCheckoutClient({
      ORDERPRO_STOREFRONT_CHECKOUT_BASE_URL: "https://orderpro.example",
      ORDERPRO_STOREFRONT_CHECKOUT_SHARED_SECRET: "x".repeat(32)
    })).not.toBeNull();
  });

  it("accepts an ASAP regular pickup and rejects ASAP balloons", () => {
    expect(orderProPaidCheckoutSchema.parse(paidCheckout).groups[0]).toMatchObject({
      id: "regular",
      pickup: { timing: "ASAP" }
    });
    expect(orderProPaidCheckoutSchema.safeParse({
      ...paidCheckout,
      groups: [{ ...paidCheckout.groups[0], id: "balloons" }]
    }).success).toBe(false);
  });

  it("posts one authenticated idempotent paid-checkout request", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        "x-orderpro-checkout-key": "x".repeat(32),
        "idempotency-key": "square-payment:square-payment-123",
        "x-correlation-id": "checkout:checkout-attempt-123"
      });
      return new Response(JSON.stringify({
        ok: true,
        replayed: false,
        checkout: {
          id: "00000000-0000-4000-8000-000000000100",
          status: "PAID",
          checkoutAttemptId: "checkout-attempt-123",
          squareOrderId: "square-order-123",
          squarePaymentId: "square-payment-123",
          groups: [{
            id: "00000000-0000-4000-8000-000000000101",
            groupKey: "regular",
            status: "NEW",
            employeeQueue: "PICKUP_ASAP"
          }]
        }
      }), { status: 201, headers: { "content-type": "application/json" } });
    });
    const client = createOrderProPaidCheckoutClient({
      baseUrl: "https://orderpro.example",
      sharedSecret: "x".repeat(32),
      fetchImpl: fetchImpl as typeof fetch
    });

    const result = await client.ingest(paidCheckout);

    expect(result.checkout.groups[0].employeeQueue).toBe("PICKUP_ASAP");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://orderpro.example/api/internal/storefront/paid-checkouts",
      expect.objectContaining({ method: "POST", redirect: "error" })
    );
  });
});
