/**
 * Issues a linked Square refund to the original payment method. Production
 * writes remain disabled; Sandbox also requires a dedicated returns switch.
 */

import "server-only";

import { SquareClient, SquareEnvironment, SquareError } from "square";
import { env } from "@/lib/validation/env";
import { assertSquareWriteAllowed } from "@/server/square/client";

export type SquareReturnRefundResult = {
  refundId: string;
  status: string;
  amountCents: number;
  currency: "USD";
};

export async function refundReturnToOriginalPayment(input: {
  rmaNumber: string;
  paymentId: string;
  amountCents: number;
  client?: Pick<SquareClient, "refunds">;
}): Promise<SquareReturnRefundResult> {
  assertSquareWriteAllowed();
  if (env.SQUARE_RETURNS_REFUNDS_ENABLED !== "true") {
    throw new SquareReturnRefundError("SQUARE_RETURN_REFUNDS_DISABLED");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1) {
    throw new SquareReturnRefundError("SQUARE_REFUND_AMOUNT_INVALID");
  }
  const paymentId = input.paymentId.trim();
  if (!paymentId) throw new SquareReturnRefundError("SQUARE_PAYMENT_ID_MISSING");
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new SquareReturnRefundError("SQUARE_ACCESS_TOKEN_MISSING");
  const client = input.client ?? new SquareClient({
    token: accessToken,
    environment: SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });
  try {
    const response = await client.refunds.refundPayment({
      idempotencyKey: stableRefundKey(input.rmaNumber),
      paymentId,
      amountMoney: { amount: BigInt(input.amountCents), currency: "USD" },
      reason: `Approved return ${input.rmaNumber}`.slice(0, 192)
    });
    const refund = response.refund;
    if (!refund?.id || !refund.status) throw new SquareReturnRefundError("SQUARE_REFUND_RESPONSE_INVALID");
    return {
      refundId: refund.id,
      status: refund.status,
      amountCents: Number(refund.amountMoney?.amount ?? input.amountCents),
      currency: "USD"
    };
  } catch (error) {
    if (error instanceof SquareReturnRefundError) throw error;
    if (error instanceof SquareError) {
      throw new SquareReturnRefundError("SQUARE_REFUND_REJECTED", { cause: error });
    }
    throw new SquareReturnRefundError("SQUARE_REFUND_UNAVAILABLE", { cause: error });
  }
}

function stableRefundKey(rmaNumber: string) {
  return `return-${rmaNumber.replace(/[^A-Za-z0-9_-]/g, "-")}-v1`.slice(0, 45);
}

export class SquareReturnRefundError extends Error {
  readonly code: string;

  constructor(code: string, options?: { cause?: unknown }) {
    super("The refund could not be completed.", options);
    this.name = "SquareReturnRefundError";
    this.code = code;
  }
}
