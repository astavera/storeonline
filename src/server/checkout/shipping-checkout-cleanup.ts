import "server-only";

import { SquareClient, SquareEnvironment } from "square";
import { env } from "@/lib/validation/env";
import { getCheckoutAttemptRepository } from "@/server/checkout/checkout-attempt-repository";
import { getOrderProShippingOrderClient } from "@/server/orderpro/shipping-order-client";
import { deleteSquareHostedCheckoutLink } from "@/server/square/hosted-checkout";
import { confirmCompletedShippingPayment } from "@/server/webhooks/shipping-payment-confirmation";

export async function cleanupExpiredShippingCheckouts(limit = 10) {
  const repository = getCheckoutAttemptRepository();
  const orderPro = getOrderProShippingOrderClient();
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!orderPro || !accessToken) return { inspected: 0, released: 0, completed: 0 };

  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production"
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
    timeoutInSeconds: 20,
    maxRetries: 2
  });
  const candidates = await repository.listExpiredShippingCheckouts({ limit });
  let released = 0;
  let completed = 0;

  for (const checkout of candidates) {
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

    await orderPro.release({
      shippingOrderId: checkout.orderproShippingOrderId,
      reason: "ABANDONED"
    });
    await repository.markShippingCheckoutExpired(checkout.attemptId);
    released += 1;
  }

  return { inspected: candidates.length, released, completed };
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
