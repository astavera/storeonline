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
});
