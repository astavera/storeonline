/**
 * Verifies the isolated behavior of checkout attempt repository.
 */

import { describe, expect, it } from "vitest";
import {
  CheckoutIdempotencyConflictError,
  hashCheckoutRequest,
  InMemoryCheckoutAttemptRepository
} from "@/server/checkout/checkout-attempt-repository";
import { quoteCart } from "@/server/checkout/cart-service";

describe("checkout attempt repository", () => {
  it("hashes equivalent requests deterministically", () => {
    expect(hashCheckoutRequest({ fulfillment: "pickup", items: [1] }))
      .toBe(hashCheckoutRequest({ items: [1], fulfillment: "pickup" }));
  });

  it("replays the same validation and rejects idempotency key reuse", async () => {
    const repository = new InMemoryCheckoutAttemptRepository();
    const quote = quoteCart({ items: [{ squareVariationId: "seed-toy-building-set", quantity: 1 }] });
    const first = await repository.recordValidation({
      idempotencyKey: "checkout-key-1",
      requestHash: "hash-1",
      quote,
      errors: []
    });
    const replay = await repository.recordValidation({
      idempotencyKey: "checkout-key-1",
      requestHash: "hash-1",
      quote,
      errors: []
    });

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ attemptId: first.attemptId, replayed: true });
    await expect(repository.recordValidation({
      idempotencyKey: "checkout-key-1",
      requestHash: "different-hash",
      quote,
      errors: []
    })).rejects.toBeInstanceOf(CheckoutIdempotencyConflictError);
  });

  it("persists one durable OrderPRO and Square correlation for a shipping checkout", async () => {
    const repository = new InMemoryCheckoutAttemptRepository();
    const quote = quoteCart({ items: [{ squareVariationId: "seed-toy-building-set", quantity: 1 }] });
    const attempt = await repository.recordValidation({
      idempotencyKey: "shipping-checkout-key-1",
      requestHash: "shipping-hash-1",
      quote,
      errors: []
    });
    const orderproId = "00000000-0000-4000-8000-000000000101";

    await repository.recordShippingReservation({
      attemptId: attempt.attemptId,
      orderproShippingOrderId: orderproId,
      shippingContext: { rateId: "rate-1", destinationHash: "a".repeat(64) }
    });
    const bound = await repository.recordHostedCheckout({
      attemptId: attempt.attemptId,
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "square-link-1"
    });

    expect(bound).toMatchObject({
      orderproShippingOrderId: orderproId,
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "square-link-1"
    });
    await expect(repository.recordHostedCheckout({
      attemptId: attempt.attemptId,
      squareOrderId: "different-square-order",
      squarePaymentLinkId: "square-link-1"
    })).rejects.toBeInstanceOf(CheckoutIdempotencyConflictError);
  });

  it("persists and completes one durable Pickup hold-to-payment correlation", async () => {
    const repository = new InMemoryCheckoutAttemptRepository();
    const quote = quoteCart({ items: [{ squareVariationId: "seed-toy-building-set", quantity: 1 }] });
    const attempt = await repository.recordValidation({
      idempotencyKey: "pickup-checkout-key-1",
      requestHash: "pickup-hash-1",
      quote,
      errors: []
    });
    const holdId = "00000000-0000-4000-8000-000000000201";
    const expiresAt = new Date("2026-08-19T15:15:00.000Z");

    await repository.recordCapacityReservation({
      attemptId: attempt.attemptId,
      fulfillmentMode: "PICKUP",
      orderproCapacityHoldId: holdId,
      expiresAt,
      fulfillmentContext: { quoteId: "quote-1", slotId: "slot-1" }
    });
    await repository.recordCapacityHostedCheckout({
      attemptId: attempt.attemptId,
      squareOrderId: "square-order-pickup-1",
      squarePaymentLinkId: "square-link-pickup-1"
    });

    expect(await repository.listExpiredCapacityCheckouts({
      now: new Date("2026-08-19T15:16:00.000Z")
    })).toEqual([expect.objectContaining({
      attemptId: attempt.attemptId,
      fulfillmentMode: "PICKUP",
      orderproCapacityHoldId: holdId,
      squareOrderId: "square-order-pickup-1"
    })]);

    await repository.markCapacityCheckoutCompleted({
      attemptId: attempt.attemptId,
      squarePaymentId: "square-payment-pickup-1"
    });
    expect(await repository.findCapacityCheckout(attempt.attemptId)).toMatchObject({
      squarePaymentId: "square-payment-pickup-1"
    });
    await expect(repository.recordCapacityHostedCheckout({
      attemptId: attempt.attemptId,
      squareOrderId: "different-square-order",
      squarePaymentLinkId: "square-link-pickup-1"
    })).rejects.toBeInstanceOf(CheckoutIdempotencyConflictError);
  });
});
