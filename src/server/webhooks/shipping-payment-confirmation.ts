/**
 * Implements server-side shipping payment confirmation behavior and persistence boundaries.
 */

import "server-only";

import { SquareClient, SquareEnvironment } from "square";
import { env } from "@/lib/validation/env";
import { getCheckoutAttemptRepository } from "@/server/checkout/checkout-attempt-repository";
import {
  getOrderProShippingOrderClient,
  type OrderProShippingDestination
} from "@/server/orderpro/shipping-order-client";
import { fingerprintTaxAddress } from "@/server/tax/tax-fingerprint";
import { persistFinalShippingTaxReconciliation } from "@/server/tax/shipping-tax-finalization-repository";
import { reconcileSquareOrderTax } from "@/server/tax/square-tax-reconciliation";
import { getTaxQuoteRepository, type TaxQuoteRecord } from "@/server/tax/tax-quote-repository";
import { reportCompletedSquareSaleToStripeTax } from "@/server/tax/stripe-tax-reporting";

const storefrontSourceName = "Modern State NYC Website";

export async function confirmCompletedShippingPayment(paymentId: string) {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("SQUARE_PAYMENT_READ_NOT_CONFIGURED");
  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production"
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });

  const paymentResponse = await client.payments.get({ paymentId });
  const payment = paymentResponse.payment;
  if (!payment) throw new Error("SQUARE_PAYMENT_NOT_FOUND");
  if (payment.status !== "COMPLETED") return;
  const confirmedPaymentId = payment.id?.trim();
  if (!confirmedPaymentId || confirmedPaymentId !== paymentId) {
    throw new Error("SQUARE_PAYMENT_ID_MISMATCH");
  }
  if (!payment.orderId || !payment.locationId || !payment.amountMoney) {
    throw new Error("SQUARE_COMPLETED_PAYMENT_INCOMPLETE");
  }
  if (payment.amountMoney.currency !== "USD") throw new Error("SQUARE_PAYMENT_CURRENCY_MISMATCH");
  const amountPaidCents = safeMoneyAmount(payment.amountMoney.amount);

  const orderResponse = await client.orders.get({ orderId: payment.orderId });
  const order = orderResponse.order;
  if (!order) throw new Error("SQUARE_ORDER_NOT_FOUND");
  if (
    order.id !== payment.orderId ||
    order.locationId !== payment.locationId ||
    order.source?.name !== storefrontSourceName
  ) {
    throw new Error("SQUARE_ORDER_OWNERSHIP_MISMATCH");
  }
  if (order.metadata?.fulfillment_mode !== "shipping") return;
  const explicitDestinationTax = order.metadata?.tax_application_mode === "EXPLICIT_DESTINATION_TAX";

  const checkoutAttemptId = order.metadata.checkout_attempt_id?.trim() || order.referenceId?.trim();
  const orderProShippingOrderId = order.metadata.orderpro_shipping_order_id?.trim();
  if (!checkoutAttemptId || !orderProShippingOrderId) {
    throw new Error("SQUARE_SHIPPING_CORRELATION_MISSING");
  }
  if (order.referenceId && order.referenceId !== checkoutAttemptId) {
    throw new Error("SQUARE_CHECKOUT_REFERENCE_MISMATCH");
  }

  const checkoutRepository = getCheckoutAttemptRepository();
  const checkout = await checkoutRepository.findShippingCheckout(checkoutAttemptId);
  if (
    !checkout ||
    checkout.orderproShippingOrderId !== orderProShippingOrderId ||
    checkout.squareOrderId !== order.id
  ) {
    throw new Error("STOREFRONT_SHIPPING_CORRELATION_MISMATCH");
  }
  assertSquareOrderCart(order.lineItems ?? [], checkout.quote.lines);
  const orderTotal = order.totalMoney?.amount;
  if (
    order.totalMoney?.currency !== "USD" ||
    orderTotal === undefined ||
    safeMoneyAmount(orderTotal) !== amountPaidCents
  ) {
    throw new Error("SQUARE_PAYMENT_TOTAL_MISMATCH");
  }

  const shipment = order.fulfillments?.find((fulfillment) => fulfillment.type === "SHIPMENT");
  const destination = normalizeSquareDestination(shipment?.shipmentDetails?.recipient);
  const paidAt = payment.createdAt ?? payment.updatedAt ?? new Date().toISOString();
  if (explicitDestinationTax) {
    const taxQuoteId = order.metadata.tax_quote_id?.trim();
    if (!taxQuoteId) throw new Error("SQUARE_SHIPPING_TAX_QUOTE_MISSING");
    const taxQuoteRepository = getTaxQuoteRepository();
    const taxQuote = await taxQuoteRepository.findForCheckoutAttempt(checkoutAttemptId);
    if (
      !taxQuote ||
      taxQuote.id !== taxQuoteId ||
      taxQuote.status !== "CONSUMED" ||
      taxQuote.checkoutAttemptId !== checkoutAttemptId
    ) {
      throw new Error("STOREFRONT_SHIPPING_TAX_CORRELATION_MISMATCH");
    }
    if (fingerprintTaxAddress(destination.address) !== taxQuote.destinationFingerprint) {
      throw new Error("SQUARE_SHIPPING_TAX_DESTINATION_MISMATCH");
    }
    const finalTax = reconcileSquareOrderTax(order, {
      hasNexus: taxQuote.nexusDecision === "COLLECT"
    });
    assertFinalTaxMatchesEstimate(finalTax, taxQuote);
    await persistFinalShippingTaxReconciliation({
      squareOrderId: order.id,
      squarePaymentId: confirmedPaymentId,
      quote: taxQuote,
      final: finalTax
    });
    const stripeTransaction = await reportCompletedSquareSaleToStripeTax({
      quote: taxQuote,
      squareOrderId: order.id,
      paidAt
    });
    await taxQuoteRepository.markProviderReported({
      taxQuoteId: taxQuote.id,
      providerTransactionId: stripeTransaction.id
    });
  }
  const orderPro = getOrderProShippingOrderClient();
  if (!orderPro) throw new Error("ORDERPRO_SHIPPING_CONFIRMATION_NOT_CONFIGURED");

  await orderPro.confirm({
    shippingOrderId: orderProShippingOrderId,
    squareOrderId: order.id,
    squarePaymentId: confirmedPaymentId,
    squareLocationId: payment.locationId,
    amountPaidCents,
    currency: "USD",
    paidAt,
    destination
  });
  await checkoutRepository.markShippingCheckoutCompleted(checkoutAttemptId);
}

function assertFinalTaxMatchesEstimate(
  finalTax: ReturnType<typeof reconcileSquareOrderTax>,
  quote: TaxQuoteRecord
) {
  if (
    finalTax.merchandiseSubtotalCents - finalTax.discountCents !== quote.subtotalCents ||
    finalTax.discountCents !== quote.discountCents ||
    finalTax.shippingCents !== quote.shippingCents ||
    finalTax.merchandiseTaxCents !== quote.merchandiseTaxCents ||
    finalTax.shippingTaxCents !== quote.shippingTaxCents ||
    finalTax.totalTaxCents !== quote.totalTaxCents ||
    finalTax.totalCents !== quote.totalCents
  ) {
    throw new Error("SQUARE_FINAL_TAX_ESTIMATE_MISMATCH");
  }
}

function safeMoneyAmount(value: bigint | null | undefined) {
  if (value === null || value === undefined || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("SQUARE_MONEY_AMOUNT_INVALID");
  }
  return Number(value);
}

function assertSquareOrderCart(
  lineItems: Array<{
    catalogObjectId?: string | null;
    quantity?: string;
  }>,
  quotedLines: Array<{ squareVariationId: string; quantity: number }>
) {
  const actual = new Map<string, number>();
  for (const line of lineItems) {
    const id = line.catalogObjectId?.trim();
    if (!id) continue;
    const quantity = Number(line.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error("SQUARE_ORDER_QUANTITY_INVALID");
    }
    actual.set(id, (actual.get(id) ?? 0) + quantity);
  }
  const expected = new Map<string, number>();
  for (const line of quotedLines) {
    expected.set(
      line.squareVariationId,
      (expected.get(line.squareVariationId) ?? 0) + line.quantity
    );
  }
  if (
    actual.size !== expected.size ||
    [...expected].some(([id, quantity]) => actual.get(id) !== quantity)
  ) {
    throw new Error("SQUARE_ORDER_CART_MISMATCH");
  }
}

function normalizeSquareDestination(recipient: {
  displayName?: string | null;
  emailAddress?: string | null;
  phoneNumber?: string | null;
  address?: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    locality?: string | null;
    administrativeDistrictLevel1?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
} | null | undefined): OrderProShippingDestination {
  const address = recipient?.address;
  const destination = {
    name: recipient?.displayName?.trim() ?? "",
    email: recipient?.emailAddress?.trim() ?? "",
    phone: recipient?.phoneNumber?.trim() ?? "",
    address: {
      line1: address?.addressLine1?.trim() ?? "",
      ...(address?.addressLine2?.trim() ? { line2: address.addressLine2.trim() } : {}),
      city: address?.locality?.trim() ?? "",
      state: address?.administrativeDistrictLevel1?.trim().toUpperCase() ?? "",
      postalCode: address?.postalCode?.trim() ?? "",
      country: address?.country
    }
  };
  if (
    destination.name.length < 2 ||
    !destination.email.includes("@") ||
    destination.phone.length < 7 ||
    destination.address.line1.length < 3 ||
    destination.address.city.length < 2 ||
    destination.address.state.length !== 2 ||
    !/^\d{5}(?:-\d{4})?$/.test(destination.address.postalCode) ||
    destination.address.country !== "US"
  ) {
    throw new Error("SQUARE_SHIPPING_DESTINATION_INVALID");
  }
  return destination as OrderProShippingDestination;
}
