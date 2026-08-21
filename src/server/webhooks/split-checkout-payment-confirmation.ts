/** Confirms one paid Square order as multiple operational fulfillment groups in OrderPRO. */

import "server-only";

import { SquareClient, SquareEnvironment } from "square";
import { z } from "zod";
import { orderProPaidCheckoutSchema } from "@/features/checkout/orderpro-paid-checkout-contract";
import { env } from "@/lib/validation/env";
import { getCheckoutAttemptRepository } from "@/server/checkout/checkout-attempt-repository";
import { getOrderProPaidCheckoutClient } from "@/server/orderpro/paid-checkout-client";

const storefrontSourceName = "Modern State NYC Website";
const addressSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.literal("US")
}).strict();
const storedGroupBase = z.object({
  id: z.enum(["regular", "balloons"]),
  locationId: z.string().min(1),
  squareLocationId: z.string().min(1),
  items: z.array(z.object({
    squareVariationId: z.string().min(1),
    quantity: z.number().int().positive(),
    source: z.enum(["storefront", "balloons"]).optional()
  }).strict()).min(1)
});
const storedContextSchema = z.object({
  schemaVersion: z.literal("storefront.split-checkout.v2"),
  customer: z.object({ name: z.string(), email: z.string().email(), phone: z.string() }).strict(),
  groups: z.array(z.discriminatedUnion("fulfillmentMode", [
    storedGroupBase.extend({
      fulfillmentMode: z.literal("pickup"),
      pickup: z.discriminatedUnion("timing", [
        z.object({ timing: z.literal("ASAP") }).strict(),
        z.object({
          timing: z.literal("SCHEDULED"),
          requestedDate: z.string().date(),
          slotId: z.string(),
          slotLabel: z.string(),
          startsAt: z.string().datetime({ offset: true }),
          endsAt: z.string().datetime({ offset: true })
        }).strict()
      ]),
      orderProCapacityHoldId: z.string().uuid().optional()
    }).strict().superRefine((group, context) => {
      if (group.pickup.timing === "SCHEDULED" && !group.orderProCapacityHoldId) {
        context.addIssue({ code: "custom", message: "Scheduled pickup reservation is missing." });
      }
      if (group.pickup.timing === "ASAP" && group.orderProCapacityHoldId) {
        context.addIssue({ code: "custom", message: "ASAP pickup cannot have a scheduled capacity reservation." });
      }
    }),
    storedGroupBase.extend({
      fulfillmentMode: z.literal("local-delivery"),
      localDelivery: z.object({
        quoteId: z.string(),
        slotId: z.string(),
        feeCents: z.number().int().nonnegative(),
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }),
        address: addressSchema
      }).strict(),
      orderProCapacityHoldId: z.string().uuid()
    }).strict(),
    storedGroupBase.extend({
      fulfillmentMode: z.literal("shipping"),
      shipping: z.object({
        rateId: z.string(),
        amountCents: z.number().int().nonnegative(),
        carrier: z.string(),
        serviceName: z.string(),
        readyToShipDate: z.string().date(),
        address: addressSchema
      }).strict(),
      orderProShippingOrderId: z.string().uuid()
    }).strict()
  ])).min(1).max(2)
}).strict();

export async function confirmCompletedSplitCheckoutPayment(paymentId: string) {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("SQUARE_PAYMENT_READ_NOT_CONFIGURED");
  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });
  const payment = (await client.payments.get({ paymentId })).payment;
  if (!payment) throw new Error("SQUARE_PAYMENT_NOT_FOUND");
  if (payment.status !== "COMPLETED") return;
  if (!payment.orderId || !payment.locationId || !payment.amountMoney || payment.amountMoney.currency !== "USD") {
    throw new Error("SQUARE_COMPLETED_PAYMENT_INCOMPLETE");
  }
  const order = (await client.orders.get({ orderId: payment.orderId })).order;
  if (!order) throw new Error("SQUARE_ORDER_NOT_FOUND");
  if (order.metadata?.fulfillment_model !== "ORDERPRO_SPLIT") return;
  if (order.id !== payment.orderId || order.locationId !== payment.locationId || order.source?.name !== storefrontSourceName) {
    throw new Error("SQUARE_ORDER_OWNERSHIP_MISMATCH");
  }
  const checkoutAttemptId = order.metadata.checkout_attempt_id?.trim() || order.referenceId?.trim();
  if (!checkoutAttemptId || (order.referenceId && order.referenceId !== checkoutAttemptId)) {
    throw new Error("SQUARE_SPLIT_CHECKOUT_CORRELATION_MISSING");
  }

  const repository = getCheckoutAttemptRepository();
  const checkout = await repository.findSplitCheckout(checkoutAttemptId, {
    allowCompletedReplay: true
  });
  if (!checkout || checkout.squareOrderId !== order.id) throw new Error("STOREFRONT_SPLIT_CHECKOUT_CORRELATION_MISMATCH");
  const context = storedContextSchema.parse(checkout.context);
  assertSquareOrderCart(order.lineItems ?? [], checkout.quote.lines);
  const totalPaidCents = money(payment.amountMoney.amount);
  if (money(order.totalMoney?.amount) !== totalPaidCents || order.totalMoney?.currency !== "USD") {
    throw new Error("SQUARE_PAYMENT_TOTAL_MISMATCH");
  }

  const parentTaxCents = money(order.totalTaxMoney?.amount ?? 0n);
  const taxByGroup = allocateGroupTax(order.lineItems ?? [], checkout.quote.lines, parentTaxCents, context.groups.map((group) => group.id));
  const paidCheckout = orderProPaidCheckoutSchema.parse({
    schemaVersion: "orderpro.paid-checkout.v1",
    checkoutAttemptId,
    square: {
      orderId: order.id,
      paymentId,
      locationId: payment.locationId,
      paidAt: payment.createdAt ?? payment.updatedAt ?? new Date().toISOString()
    },
    customer: context.customer,
    currency: "USD",
    pricing: {
      merchandiseSubtotalCents: checkout.quote.subtotalCents,
      fulfillmentFeesCents: context.groups.reduce((total, group) => total + fulfillmentFee(group), 0),
      discountCents: money(order.totalDiscountMoney?.amount ?? 0n),
      taxCents: parentTaxCents,
      totalPaidCents
    },
    groups: context.groups.map((group) => {
      const quotedGroup = checkout.quote.checkoutGroups.find((candidate) => candidate.id === group.id);
      if (!quotedGroup) throw new Error("SPLIT_CHECKOUT_GROUP_QUOTE_MISSING");
      const base = {
        id: group.id,
        locationId: group.locationId,
        squareLocationId: group.squareLocationId,
        items: group.items.map((item) => ({
          squareVariationId: item.squareVariationId,
          name: quotedGroup.lines.find((line) => line.squareVariationId === item.squareVariationId)?.name ?? "Item",
          quantity: item.quantity
        })),
        pricing: {
          merchandiseSubtotalCents: quotedGroup.subtotalCents,
          fulfillmentFeeCents: fulfillmentFee(group),
          taxCents: taxByGroup.get(group.id) ?? 0
        }
      };
      if (group.fulfillmentMode === "pickup") return { ...base, fulfillmentMode: "pickup" as const, pickup: group.pickup };
      if (group.fulfillmentMode === "local-delivery") return {
        ...base,
        fulfillmentMode: "local-delivery" as const,
        delivery: { ...group.localDelivery, feeCents: group.localDelivery.feeCents }
      };
      return {
        ...base,
        fulfillmentMode: "shipping" as const,
        shipping: {
          reservationId: group.orderProShippingOrderId,
          rateId: group.shipping.rateId,
          carrier: group.shipping.carrier,
          serviceName: group.shipping.serviceName,
          readyToShipDate: group.shipping.readyToShipDate,
          address: group.shipping.address,
          feeCents: group.shipping.amountCents
        }
      };
    })
  });

  const orderPro = getOrderProPaidCheckoutClient();
  if (!orderPro) throw new Error("ORDERPRO_PAID_CHECKOUT_NOT_CONFIGURED");
  const result = await orderPro.ingest(paidCheckout);
  if (
    result.checkout.checkoutAttemptId !== checkoutAttemptId
    || result.checkout.squareOrderId !== order.id
    || result.checkout.squarePaymentId !== paymentId
    || result.checkout.groups.length !== context.groups.length
    || context.groups.some((group) => !result.checkout.groups.some((accepted) => (
      accepted.groupKey === group.id && accepted.employeeQueue === employeeQueue(group)
    )))
  ) {
    throw new Error("ORDERPRO_PAID_CHECKOUT_EVIDENCE_MISMATCH");
  }
  await repository.markSplitCheckoutCompleted(checkoutAttemptId);
}

function fulfillmentFee(group: z.infer<typeof storedContextSchema>["groups"][number]) {
  if (group.fulfillmentMode === "local-delivery") return group.localDelivery.feeCents;
  if (group.fulfillmentMode === "shipping") return group.shipping.amountCents;
  return 0;
}

function employeeQueue(group: z.infer<typeof storedContextSchema>["groups"][number]) {
  if (group.fulfillmentMode === "pickup") {
    return group.pickup.timing === "ASAP" ? "PICKUP_ASAP" : "PICKUP_SCHEDULED";
  }
  if (group.fulfillmentMode === "local-delivery") return "LOCAL_DELIVERY";
  return "SHIPPING";
}

function allocateGroupTax(
  lineItems: Array<{ catalogObjectId?: string | null; metadata?: Record<string, string | null> | null; totalTaxMoney?: { amount?: bigint | null; currency?: string | null } | null }>,
  quotedLines: Array<{ squareVariationId: string; checkoutGroup?: "regular" | "balloons" }>,
  parentTaxCents: number,
  groupIds: Array<"regular" | "balloons">
) {
  const groupByVariation = new Map(quotedLines.map((line) => [line.squareVariationId, line.checkoutGroup ?? "regular"]));
  const result = new Map(groupIds.map((id) => [id, 0]));
  for (const line of lineItems) {
    const group = (line.catalogObjectId ? groupByVariation.get(line.catalogObjectId) : undefined)
      ?? (line.metadata?.checkout_group === "balloons" ? "balloons" : line.metadata?.checkout_group === "regular" ? "regular" : undefined);
    if (!group || !result.has(group)) continue;
    if (line.totalTaxMoney?.currency && line.totalTaxMoney.currency !== "USD") throw new Error("SQUARE_TAX_CURRENCY_MISMATCH");
    result.set(group, (result.get(group) ?? 0) + money(line.totalTaxMoney?.amount ?? 0n));
  }
  const allocated = [...result.values()].reduce((total, value) => total + value, 0);
  if (allocated > parentTaxCents) throw new Error("SQUARE_GROUP_TAX_MISMATCH");
  if (allocated < parentTaxCents) {
    const residualGroup = groupIds.includes("regular") ? "regular" : groupIds[0];
    result.set(residualGroup, (result.get(residualGroup) ?? 0) + parentTaxCents - allocated);
  }
  return result;
}

function assertSquareOrderCart(
  lineItems: Array<{ catalogObjectId?: string | null; quantity?: string }>,
  quotedLines: Array<{ squareVariationId: string; quantity: number }>
) {
  const actual = new Map<string, number>();
  for (const line of lineItems) {
    const id = line.catalogObjectId?.trim();
    if (!id) continue;
    const quantity = Number(line.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("SQUARE_ORDER_QUANTITY_INVALID");
    actual.set(id, (actual.get(id) ?? 0) + quantity);
  }
  const expected = new Map<string, number>();
  for (const line of quotedLines) expected.set(line.squareVariationId, (expected.get(line.squareVariationId) ?? 0) + line.quantity);
  if (actual.size !== expected.size || [...expected].some(([id, quantity]) => actual.get(id) !== quantity)) {
    throw new Error("SQUARE_ORDER_CART_MISMATCH");
  }
}

function money(value: bigint | null | undefined) {
  if (value === null || value === undefined || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("SQUARE_MONEY_AMOUNT_INVALID");
  return Number(value);
}
