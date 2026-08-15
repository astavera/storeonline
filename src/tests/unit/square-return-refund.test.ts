/**
 * Verifies that return refunds remain linked to the original Square payment and
 * use a stable idempotency key.
 */

import type { SquareClient } from "square";
import { beforeEach, describe, expect, it, vi } from "vitest";

const squareEnvironment = vi.hoisted(() => ({
  SQUARE_ENVIRONMENT: "sandbox" as "sandbox" | "production",
  SQUARE_ACCESS_TOKEN: "sandbox-token-for-test",
  SQUARE_APPLICATION_ID: "sandbox-application",
  SQUARE_RETURNS_REFUNDS_ENABLED: "true"
}));

vi.mock("@/lib/validation/env", () => ({ env: squareEnvironment }));

import { refundReturnToOriginalPayment } from "@/server/returns/square-return-refund";

describe("Square return refund", () => {
  beforeEach(() => {
    squareEnvironment.SQUARE_ENVIRONMENT = "sandbox";
    squareEnvironment.SQUARE_ACCESS_TOKEN = "sandbox-token-for-test";
    squareEnvironment.SQUARE_RETURNS_REFUNDS_ENABLED = "true";
  });

  it("submits a linked Sandbox refund to the original payment method", async () => {
    const refundPayment = vi.fn(async (request: unknown) => {
      void request;
      return {
        refund: {
          id: "square-refund-1",
          status: "COMPLETED",
          amountMoney: { amount: BigInt(1_252), currency: "USD" }
        }
      };
    });
    const client = {
      refunds: { refundPayment }
    } as unknown as Pick<SquareClient, "refunds">;

    const result = await refundReturnToOriginalPayment({
      rmaNumber: "RMA-3001",
      paymentId: "square-original-payment-3001",
      amountCents: 1_252,
      client
    });

    expect(result).toMatchObject({
      refundId: "square-refund-1",
      status: "COMPLETED",
      amountCents: 1_252
    });
    expect(refundPayment).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "return-RMA-3001-v1",
      paymentId: "square-original-payment-3001",
      amountMoney: { amount: BigInt(1_252), currency: "USD" }
    }));
    const request = refundPayment.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request.destinationId).toBeUndefined();
    expect(request.unlinked).toBeUndefined();
  });

  it("fails closed for production writes", async () => {
    squareEnvironment.SQUARE_ENVIRONMENT = "production";
    squareEnvironment.SQUARE_ACCESS_TOKEN = "production-token-for-test";

    await expect(refundReturnToOriginalPayment({
      rmaNumber: "RMA-3001",
      paymentId: "square-original-payment-3001",
      amountCents: 1_252,
      client: { refunds: {} } as unknown as Pick<SquareClient, "refunds">
    })).rejects.toThrow("disabled outside sandbox");
  });
});
