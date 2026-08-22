/**
 * Implements server-side shipping checkout cleanup behavior and persistence boundaries.
 */

import "server-only";

import { SquareClient, SquareEnvironment } from "square";
import { z } from "zod";
import { env } from "@/lib/validation/env";
import { getCheckoutAttemptRepository } from "@/server/checkout/checkout-attempt-repository";
import { isShippingOrderAlreadyReleased } from "@/server/checkout/shipping-checkout-cleanup-policy";
import {
  getOrderProShippingOrderClient,
  orderProShippingCommandIdentity
} from "@/server/orderpro/shipping-order-client";
import { getOrderProStorefrontFulfillmentClient } from "@/server/orderpro/storefront-fulfillment-client";
import { deleteSquareHostedCheckoutLink } from "@/server/square/hosted-checkout";
import { confirmCompletedShippingPayment } from "@/server/webhooks/shipping-payment-confirmation";
import { confirmCompletedSplitCheckoutPayment } from "@/server/webhooks/split-checkout-payment-confirmation";

const splitReservationContextSchema = z.object({
  groups: z.array(z.object({
    orderProCapacityHoldId: z.string().uuid().optional(),
    orderProShippingOrderId: z.string().uuid().optional()
  }).passthrough()).min(1).max(2)
}).passthrough();

export async function cleanupExpiredShippingCheckouts(limit = 10) {
  const repository = getCheckoutAttemptRepository();
  const orderPro = getOrderProShippingOrderClient();
  const capacityOrderPro = getOrderProStorefrontFulfillmentClient();
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) return { inspected: 0, released: 0, completed: 0, splitReleased: 0 };

  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production"
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
    timeoutInSeconds: 20,
    maxRetries: 2
  });
  const candidates = await repository.listExpiredShippingCheckouts({ limit });
  const splitCandidates = await repository.listExpiredSplitCheckouts({ limit });
  let released = 0;
  let completed = 0;

  for (const checkout of orderPro ? candidates : []) {
    if (!checkout.squareOrderId || !checkout.squarePaymentLinkId) continue;
    const paymentBeforeDelete = await completedPaymentId(client, checkout.squareOrderId);
    if (paymentBeforeDelete) {
      await confirmCompletedShippingPayment(paymentBeforeDelete);
      completed += 1;
      continue;
    }

    await deleteSquareHostedCheckoutLink(checkout.squarePaymentLinkId);
    const paymentAfterDelete = await completedPaymentId(client, checkout.squareOrderId);
    if (paymentAfterDelete) {
      await confirmCompletedShippingPayment(paymentAfterDelete);
      completed += 1;
      continue;
    }

    try {
      await orderPro!.release({
        shippingOrderId: checkout.orderproShippingOrderId,
        reason: "ABANDONED",
        idempotencyKey: orderProShippingCommandIdentity("release", checkout.attemptId, "expiry"),
        correlationId: orderProShippingCommandIdentity("release", checkout.attemptId, "expiry")
      });
    } catch (error) {
      // Square is unpaid and its checkout link is closed. This exact OrderPRO
      // code means a prior failure path already released the inventory with a
      // different audited reason, so only the stale Storefront record remains.
      if (!isShippingOrderAlreadyReleased(error)) throw error;
    }
    await repository.markShippingCheckoutExpired(checkout.attemptId);
    released += 1;
  }

  let splitReleased = 0;
  for (const checkout of splitCandidates) {
    if (!checkout.squareOrderId || !checkout.squarePaymentLinkId) continue;
    const context = splitReservationContextSchema.parse(checkout.context);
    const capacityHoldIds = context.groups.flatMap((group) => group.orderProCapacityHoldId ? [group.orderProCapacityHoldId] : []);
    const shippingOrderIds = context.groups.flatMap((group) => group.orderProShippingOrderId ? [group.orderProShippingOrderId] : []);
    if ((capacityHoldIds.length > 0 && !capacityOrderPro) || (shippingOrderIds.length > 0 && !orderPro)) continue;

    const paymentBeforeDelete = await completedPaymentId(client, checkout.squareOrderId);
    if (paymentBeforeDelete) {
      await confirmCompletedSplitCheckoutPayment(paymentBeforeDelete);
      completed += 1;
      continue;
    }

    await deleteSquareHostedCheckoutLink(checkout.squarePaymentLinkId);
    const paymentAfterDelete = await completedPaymentId(client, checkout.squareOrderId);
    if (paymentAfterDelete) {
      await confirmCompletedSplitCheckoutPayment(paymentAfterDelete);
      completed += 1;
      continue;
    }

    for (const capacityHoldId of capacityHoldIds) {
      await capacityOrderPro!.release({
        capacityHoldId,
        reason: "ABANDONED",
        idempotencyKey: `capacity-release:${capacityHoldId}:ABANDONED`,
        correlationId: `capacity-release:${capacityHoldId}`
      });
    }
    for (const shippingOrderId of shippingOrderIds) {
      try {
        await orderPro!.release({
          shippingOrderId,
          reason: "ABANDONED",
          idempotencyKey: orderProShippingCommandIdentity("release", checkout.attemptId, shippingOrderId, "expiry"),
          correlationId: orderProShippingCommandIdentity("release", checkout.attemptId, shippingOrderId, "expiry")
        });
      } catch (error) {
        if (!isShippingOrderAlreadyReleased(error)) throw error;
      }
    }
    await repository.markSplitCheckoutExpired(checkout.attemptId);
    splitReleased += 1;
  }

  return {
    inspected: candidates.length + splitCandidates.length,
    released: released + splitReleased,
    completed,
    splitReleased
  };
}

async function completedPaymentId(client: SquareClient, squareOrderId: string) {
  const response = await client.orders.get({ orderId: squareOrderId });
  const tender = response.order?.tenders?.find((candidate) => (
    candidate.paymentId?.trim() || candidate.id?.trim()
  ));
  const paymentId = tender?.paymentId?.trim() || tender?.id?.trim();
  if (!paymentId) return null;
  const payment = await client.payments.get({ paymentId });
  return payment.payment?.status === "COMPLETED" ? paymentId : null;
}
