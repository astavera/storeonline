/** Confirms paid Pickup/Local Delivery capacity checkouts from signed Square inbox events. */

import "server-only";

import { createHash } from "node:crypto";
import { SquareClient, SquareEnvironment } from "square";
import { env } from "@/lib/validation/env";
import { getCheckoutAttemptRepository } from
  "@/server/checkout/checkout-attempt-repository";
import { getRuntimeOrderProClient } from "@/server/orderpro/runtime";

const storefrontSourceName = "Modern State NYC Website";

export async function confirmCompletedCapacityPayment(paymentId: string) {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("SQUARE_PAYMENT_READ_NOT_CONFIGURED");
  const square = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production"
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });
  const payment = (await square.payments.get({ paymentId })).payment;
  if (!payment) throw new Error("SQUARE_PAYMENT_NOT_FOUND");
  if (payment.status !== "COMPLETED") return;
  if (
    payment.id !== paymentId || !payment.orderId || !payment.locationId ||
    payment.amountMoney?.currency !== "USD"
  ) throw new Error("SQUARE_COMPLETED_PAYMENT_INCOMPLETE");
  const amountPaidCents = safeMoneyAmount(payment.amountMoney.amount);

  const order = (await square.orders.get({ orderId: payment.orderId })).order;
  if (
    !order || order.id !== payment.orderId || order.locationId !== payment.locationId ||
    order.source?.name !== storefrontSourceName
  ) throw new Error("SQUARE_ORDER_OWNERSHIP_MISMATCH");
  const metadata = order.metadata;
  const mode = metadata?.fulfillment_mode;
  if (mode !== "pickup" && mode !== "local-delivery") return;

  const attemptId = metadata?.checkout_attempt_id?.trim() || order.referenceId?.trim();
  const holdId = metadata?.orderpro_capacity_hold_id?.trim();
  if (!attemptId || !holdId) throw new Error("SQUARE_CAPACITY_CORRELATION_MISSING");
  const repository = getCheckoutAttemptRepository();
  const checkout = await repository.findCapacityCheckout(attemptId);
  if (
    !checkout || checkout.orderproCapacityHoldId !== holdId ||
    checkout.squareOrderId !== order.id ||
    checkout.fulfillmentMode !== (mode === "pickup" ? "PICKUP" : "LOCAL_DELIVERY")
  ) throw new Error("STOREFRONT_CAPACITY_CORRELATION_MISMATCH");
  if (checkout.squarePaymentId) {
    if (checkout.squarePaymentId !== paymentId) {
      throw new Error("STOREFRONT_CAPACITY_PAYMENT_CONFLICT");
    }
    return;
  }
  assertSquareOrderCart(order.lineItems ?? [], checkout.quote.lines);
  if (
    order.totalMoney?.currency !== "USD" ||
    safeMoneyAmount(order.totalMoney.amount) !== amountPaidCents
  ) throw new Error("SQUARE_PAYMENT_TOTAL_MISMATCH");

  const fulfillment = order.fulfillments?.find((candidate) => (
    mode === "pickup" ? candidate.type === "PICKUP" : candidate.type === "DELIVERY"
  ));
  const recipient = mode === "pickup"
    ? fulfillment?.pickupDetails?.recipient
    : fulfillment?.deliveryDetails?.recipient;
  const customer = {
    name: recipient?.displayName?.trim() ?? "",
    email: recipient?.emailAddress?.trim() ?? "",
    phone: recipient?.phoneNumber?.trim() ?? "",
    address: mode === "pickup" ? null : normalizeAddress(recipient?.address)
  };
  if (customer.name.length < 2 || !customer.email.includes("@") || customer.phone.length < 7) {
    throw new Error("SQUARE_CAPACITY_CUSTOMER_INVALID");
  }

  const runtime = getRuntimeOrderProClient();
  if (!runtime.ready) throw new Error("ORDERPRO_CAPACITY_CONFIRMATION_NOT_CONFIGURED");
  const identity = capacityIdentity("confirm", attemptId, paymentId);
  await runtime.client.confirmCapacityCheckout({
    capacityHoldId: holdId,
    squareOrderId: order.id,
    squarePaymentId: paymentId,
    squareLocationId: payment.locationId,
    amountPaidCents,
    currency: "USD",
    paidAt: payment.createdAt ?? payment.updatedAt ?? new Date().toISOString(),
    customer
  }, { idempotencyKey: identity, correlationId: identity });
  await repository.markCapacityCheckoutCompleted({
    attemptId,
    squarePaymentId: paymentId
  });
}

function safeMoneyAmount(value: bigint | null | undefined) {
  if (value === null || value === undefined || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("SQUARE_MONEY_AMOUNT_INVALID");
  }
  return Number(value);
}

function assertSquareOrderCart(
  lines: Array<{ catalogObjectId?: string | null; quantity?: string }>,
  expectedLines: Array<{ squareVariationId: string; quantity: number }>
) {
  const actual = new Map<string, number>();
  for (const line of lines) {
    const id = line.catalogObjectId?.trim();
    const quantity = Number(line.quantity);
    if (!id) continue;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("SQUARE_ORDER_QUANTITY_INVALID");
    actual.set(id, (actual.get(id) ?? 0) + quantity);
  }
  const expected = new Map<string, number>();
  for (const line of expectedLines) {
    expected.set(line.squareVariationId, (expected.get(line.squareVariationId) ?? 0) + line.quantity);
  }
  if (actual.size !== expected.size || [...expected].some(([id, quantity]) => actual.get(id) !== quantity)) {
    throw new Error("SQUARE_ORDER_CART_MISMATCH");
  }
}

function normalizeAddress(address: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  locality?: string | null;
  administrativeDistrictLevel1?: string | null;
  postalCode?: string | null;
  country?: string | null;
} | null | undefined) {
  if (!address) throw new Error("SQUARE_CAPACITY_ADDRESS_INVALID");
  const normalized = {
    line1: address.addressLine1?.trim() ?? "",
    line2: address.addressLine2?.trim() || null,
    city: address.locality?.trim() ?? "",
    state: address.administrativeDistrictLevel1?.trim().toUpperCase() ?? "",
    postalCode: address.postalCode?.trim() ?? "",
    country: address.country
  };
  if (
    normalized.line1.length < 3 || normalized.city.length < 2 ||
    normalized.state.length !== 2 || !/^\d{5}(?:-\d{4})?$/.test(normalized.postalCode) ||
    normalized.country !== "US"
  ) throw new Error("SQUARE_CAPACITY_ADDRESS_INVALID");
  return normalized as typeof normalized & { country: "US" };
}

function capacityIdentity(action: string, ...parts: string[]) {
  return `capacity-${action}:v1:${createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")}`;
}
