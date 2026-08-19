/** Verifies that expiration cleanup cannot release a Pickup hold racing a payment. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupExpiredCapacityCheckouts } from
  "@/server/checkout/capacity-checkout-cleanup";

const harness = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getPayment: vi.fn(),
  deleteLink: vi.fn(async () => undefined),
  confirmPayment: vi.fn(async () => undefined),
  releaseCapacityCheckout: vi.fn(async () => ({ changed: true })),
  markExpired: vi.fn(async () => undefined)
}));

const expiredCheckout = {
  attemptId: "checkout-attempt-1",
  requestHash: "request-hash-1",
  quote: { lines: [{ squareVariationId: "variation-1", quantity: 1 }] },
  expiresAt: new Date("2026-08-19T15:15:00.000Z"),
  fulfillmentMode: "PICKUP" as const,
  squareOrderId: "square-order-1",
  squarePaymentLinkId: "square-link-1",
  squarePaymentId: null,
  orderproCapacityHoldId: "00000000-0000-4000-8000-000000000601",
  fulfillmentContext: { quoteId: "quote-1", slotId: "slot-1" }
};

vi.mock("@/lib/validation/env", () => ({
  env: { SQUARE_ACCESS_TOKEN: "sandbox-token", SQUARE_ENVIRONMENT: "sandbox" }
}));

vi.mock("square", () => ({
  SquareEnvironment: { Sandbox: "sandbox", Production: "production" },
  SquareClient: class SquareClient {
    orders = { get: harness.getOrder };
    payments = { get: harness.getPayment };
  }
}));

vi.mock("@/server/checkout/checkout-attempt-repository", () => ({
  getCheckoutAttemptRepository: () => ({
    listExpiredCapacityCheckouts: async () => [expiredCheckout],
    markCapacityCheckoutExpired: harness.markExpired
  })
}));

vi.mock("@/server/orderpro/runtime", () => ({
  getRuntimeOrderProClient: () => ({
    ready: true,
    state: "READY",
    client: { releaseCapacityCheckout: harness.releaseCapacityCheckout }
  })
}));

vi.mock("@/server/square/hosted-checkout", () => ({
  deleteSquareHostedCheckoutLink: harness.deleteLink
}));

vi.mock("@/server/webhooks/capacity-payment-confirmation", () => ({
  confirmCompletedCapacityPayment: harness.confirmPayment
}));

describe("expired Pickup checkout cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves a payment that completes while its link is being closed", async () => {
    harness.getOrder
      .mockResolvedValueOnce({ order: { id: "square-order-1", tenders: [] } })
      .mockResolvedValueOnce({
        order: { id: "square-order-1", tenders: [{ paymentId: "square-payment-1" }] }
      });
    harness.getPayment.mockResolvedValueOnce({
      payment: { id: "square-payment-1", status: "COMPLETED" }
    });

    await expect(cleanupExpiredCapacityCheckouts()).resolves.toEqual({
      inspected: 1,
      released: 0,
      completed: 1
    });
    expect(harness.deleteLink).toHaveBeenCalledWith("square-link-1");
    expect(harness.confirmPayment).toHaveBeenCalledWith("square-payment-1");
    expect(harness.releaseCapacityCheckout).not.toHaveBeenCalled();
    expect(harness.markExpired).not.toHaveBeenCalled();
  });

  it("releases and expires an abandoned checkout only after two payment checks", async () => {
    harness.getOrder.mockResolvedValue({ order: { id: "square-order-1", tenders: [] } });

    await expect(cleanupExpiredCapacityCheckouts()).resolves.toEqual({
      inspected: 1,
      released: 1,
      completed: 0
    });
    expect(harness.getOrder).toHaveBeenCalledTimes(2);
    expect(harness.releaseCapacityCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityHoldId: expiredCheckout.orderproCapacityHoldId,
        reason: "ABANDONED"
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String), correlationId: expect.any(String) })
    );
    expect(harness.markExpired).toHaveBeenCalledWith("checkout-attempt-1");
  });
});
