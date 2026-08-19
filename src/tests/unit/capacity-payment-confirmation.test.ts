/** Verifies fail-closed, exactly-once confirmation for paid Pickup checkouts. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmCompletedCapacityPayment } from
  "@/server/webhooks/capacity-payment-confirmation";

const harness = vi.hoisted(() => {
  const checkout = {
    attemptId: "checkout-attempt-1",
    requestHash: "request-hash-1",
    quote: {
      lines: [{ squareVariationId: "variation-1", quantity: 2 }]
    },
    expiresAt: new Date("2026-08-19T15:15:00.000Z"),
    fulfillmentMode: "PICKUP" as const,
    squareOrderId: "square-order-1",
    squarePaymentLinkId: "square-link-1",
    squarePaymentId: null as string | null,
    orderproCapacityHoldId: "00000000-0000-4000-8000-000000000601",
    fulfillmentContext: { quoteId: "quote-1", slotId: "slot-1" }
  };
  return {
    checkout,
    getPayment: vi.fn(),
    getOrder: vi.fn(),
    confirmCapacityCheckout: vi.fn(async () => ({ changed: true })),
    markCapacityCheckoutCompleted: vi.fn(async (input: { squarePaymentId: string }) => {
      checkout.squarePaymentId = input.squarePaymentId;
    })
  };
});

vi.mock("@/lib/validation/env", () => ({
  env: { SQUARE_ACCESS_TOKEN: "sandbox-token", SQUARE_ENVIRONMENT: "sandbox" }
}));

vi.mock("square", () => ({
  SquareEnvironment: { Sandbox: "sandbox", Production: "production" },
  SquareClient: class SquareClient {
    payments = { get: harness.getPayment };
    orders = { get: harness.getOrder };
  }
}));

vi.mock("@/server/checkout/checkout-attempt-repository", () => ({
  getCheckoutAttemptRepository: () => ({
    findCapacityCheckout: async () => harness.checkout,
    markCapacityCheckoutCompleted: harness.markCapacityCheckoutCompleted
  })
}));

vi.mock("@/server/orderpro/runtime", () => ({
  getRuntimeOrderProClient: () => ({
    ready: true,
    state: "READY",
    client: { confirmCapacityCheckout: harness.confirmCapacityCheckout }
  })
}));

const completedPayment = {
  id: "square-payment-1",
  status: "COMPLETED",
  orderId: "square-order-1",
  locationId: "square-location-1",
  amountMoney: { amount: 2829n, currency: "USD" },
  createdAt: "2026-08-19T15:05:00.000Z"
};

const pickupOrder = {
  id: "square-order-1",
  locationId: "square-location-1",
  source: { name: "Modern State NYC Website" },
  referenceId: "checkout-attempt-1",
  metadata: {
    fulfillment_mode: "pickup",
    checkout_attempt_id: "checkout-attempt-1",
    orderpro_capacity_hold_id: "00000000-0000-4000-8000-000000000601"
  },
  lineItems: [{ catalogObjectId: "variation-1", quantity: "2" }],
  totalMoney: { amount: 2829n, currency: "USD" },
  fulfillments: [{
    type: "PICKUP",
    pickupDetails: {
      recipient: {
        displayName: "Test Customer",
        emailAddress: "customer@example.com",
        phoneNumber: "2125550100"
      }
    }
  }]
};

describe("Pickup payment confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.checkout.squarePaymentId = null;
    harness.getPayment.mockResolvedValue({ payment: completedPayment });
    harness.getOrder.mockResolvedValue({ order: pickupOrder });
  });

  it("confirms one OrderPRO order for duplicate completion processing", async () => {
    await confirmCompletedCapacityPayment("square-payment-1");
    await confirmCompletedCapacityPayment("square-payment-1");

    expect(harness.confirmCapacityCheckout).toHaveBeenCalledOnce();
    expect(harness.confirmCapacityCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityHoldId: "00000000-0000-4000-8000-000000000601",
        squareOrderId: "square-order-1",
        squarePaymentId: "square-payment-1",
        amountPaidCents: 2829,
        customer: expect.objectContaining({ email: "customer@example.com" })
      }),
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        correlationId: expect.any(String)
      })
    );
    expect(harness.markCapacityCheckoutCompleted).toHaveBeenCalledOnce();
  });

  it("does not create an OrderPRO order for a failed or canceled payment", async () => {
    harness.getPayment.mockResolvedValueOnce({
      payment: { ...completedPayment, status: "CANCELED" }
    });

    await confirmCompletedCapacityPayment("square-payment-1");

    expect(harness.getOrder).not.toHaveBeenCalled();
    expect(harness.confirmCapacityCheckout).not.toHaveBeenCalled();
    expect(harness.markCapacityCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("rejects a payment whose Square cart no longer matches the server quote", async () => {
    harness.getOrder.mockResolvedValueOnce({
      order: { ...pickupOrder, lineItems: [{ catalogObjectId: "variation-1", quantity: "3" }] }
    });

    await expect(confirmCompletedCapacityPayment("square-payment-1"))
      .rejects.toThrow("SQUARE_ORDER_CART_MISMATCH");
    expect(harness.confirmCapacityCheckout).not.toHaveBeenCalled();
  });
});
