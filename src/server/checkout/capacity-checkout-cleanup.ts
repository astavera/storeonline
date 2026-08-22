/** Closes abandoned Pickup/Local Delivery links without racing completed payments. */

import "server-only";

import { createHash } from "node:crypto";
import { SquareClient, SquareEnvironment } from "square";
import { env } from "@/lib/validation/env";
import { getCheckoutAttemptRepository } from
  "@/server/checkout/checkout-attempt-repository";
import { getRuntimeOrderProClient } from "@/server/orderpro/runtime";
import { deleteSquareHostedCheckoutLink } from "@/server/square/hosted-checkout";
import { confirmCompletedCapacityPayment } from
  "@/server/webhooks/capacity-payment-confirmation";

export async function cleanupExpiredCapacityCheckouts(limit = 10) {
  const repository = getCheckoutAttemptRepository();
  const runtime = getRuntimeOrderProClient();
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!runtime.ready || !accessToken) return { inspected: 0, released: 0, completed: 0 };
  const square = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production"
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
    timeoutInSeconds: 20,
    maxRetries: 2
  });
  const candidates = await repository.listExpiredCapacityCheckouts({ limit });
  let released = 0;
  let completed = 0;

  for (const checkout of candidates) {
    if (!checkout.squareOrderId || !checkout.squarePaymentLinkId) continue;
    const before = await completedPaymentId(square, checkout.squareOrderId);
    if (before) {
      await confirmCompletedCapacityPayment(before);
      completed += 1;
      continue;
    }
    await deleteSquareHostedCheckoutLink(checkout.squarePaymentLinkId);
    const after = await completedPaymentId(square, checkout.squareOrderId);
    if (after) {
      await confirmCompletedCapacityPayment(after);
      completed += 1;
      continue;
    }
    const identity = commandIdentity("release", checkout.attemptId, "expired");
    await runtime.client.releaseCapacityCheckout({
      capacityHoldId: checkout.orderproCapacityHoldId,
      reason: "ABANDONED"
    }, { idempotencyKey: identity, correlationId: identity });
    await repository.markCapacityCheckoutExpired(checkout.attemptId);
    released += 1;
  }
  return { inspected: candidates.length, released, completed };
}

async function completedPaymentId(client: SquareClient, squareOrderId: string) {
  const order = (await client.orders.get({ orderId: squareOrderId })).order;
  const tender = order?.tenders?.find((candidate) => candidate.paymentId?.trim() || candidate.id?.trim());
  const paymentId = tender?.paymentId?.trim() || tender?.id?.trim();
  if (!paymentId) return null;
  const payment = (await client.payments.get({ paymentId })).payment;
  return payment?.status === "COMPLETED" ? paymentId : null;
}

function commandIdentity(action: string, ...parts: string[]) {
  return `capacity-${action}:v1:${createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")}`;
}
