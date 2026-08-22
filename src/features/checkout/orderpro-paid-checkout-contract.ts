/** Contract sent from StoreOnline to OrderPRO after one split checkout payment completes. */

import { z } from "zod";
import { checkoutAddressSchema, checkoutGroupIdSchema } from "@/features/checkout/contracts";

const stableId = z.string().trim().min(1).max(200);
const moneyCents = z.number().int().nonnegative().max(100_000_000);

const paidCheckoutLineSchema = z.object({
  squareVariationId: stableId,
  name: z.string().trim().min(1).max(255),
  quantity: z.number().int().min(1).max(99)
}).strict();

const groupPricingSchema = z.object({
  merchandiseSubtotalCents: moneyCents,
  fulfillmentFeeCents: moneyCents,
  taxCents: moneyCents
}).strict();

const paidCheckoutGroupBaseSchema = z.object({
  id: checkoutGroupIdSchema,
  locationId: stableId,
  squareLocationId: stableId,
  items: z.array(paidCheckoutLineSchema).min(1).max(50),
  pricing: groupPricingSchema
});

const paidPickupSelectionSchema = z.discriminatedUnion("timing", [
  z.object({ timing: z.literal("ASAP") }).strict(),
  z.object({
    timing: z.literal("SCHEDULED"),
    requestedDate: z.string().date(),
    slotId: stableId,
    slotLabel: z.string().trim().min(3).max(80),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true })
  }).strict()
]);

const paidCheckoutGroupSchema = z.discriminatedUnion("fulfillmentMode", [
  paidCheckoutGroupBaseSchema.extend({
    fulfillmentMode: z.literal("pickup"),
    pickup: paidPickupSelectionSchema
  }).strict(),
  paidCheckoutGroupBaseSchema.extend({
    fulfillmentMode: z.literal("local-delivery"),
    delivery: z.object({
      quoteId: stableId,
      slotId: stableId,
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }),
      address: checkoutAddressSchema,
      feeCents: moneyCents
    }).strict()
  }).strict(),
  paidCheckoutGroupBaseSchema.extend({
    fulfillmentMode: z.literal("shipping"),
    shipping: z.object({
      reservationId: z.string().uuid(),
      rateId: stableId,
      carrier: z.string().trim().min(1).max(80),
      serviceName: z.string().trim().min(1).max(120),
      readyToShipDate: z.string().date(),
      address: checkoutAddressSchema,
      feeCents: moneyCents
    }).strict()
  }).strict()
]);

export const orderProPaidCheckoutSchema = z.object({
  schemaVersion: z.literal("orderpro.paid-checkout.v1"),
  checkoutAttemptId: stableId,
  square: z.object({
    orderId: stableId,
    paymentId: stableId,
    locationId: stableId,
    paidAt: z.string().datetime({ offset: true })
  }).strict(),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(7).max(40)
  }).strict(),
  currency: z.literal("USD"),
  pricing: z.object({
    merchandiseSubtotalCents: moneyCents,
    fulfillmentFeesCents: moneyCents,
    discountCents: moneyCents,
    taxCents: moneyCents,
    totalPaidCents: moneyCents
  }).strict(),
  groups: z.array(paidCheckoutGroupSchema).min(1).max(2)
}).strict().superRefine((checkout, context) => {
  if (new Set(checkout.groups.map((group) => group.id)).size !== checkout.groups.length) {
    context.addIssue({ code: "custom", message: "Paid checkout group ids must be unique.", path: ["groups"] });
  }
  checkout.groups.forEach((group, index) => {
    if (group.id === "balloons" && group.fulfillmentMode === "shipping") {
      context.addIssue({ code: "custom", message: "Balloons cannot be shipped.", path: ["groups", index, "fulfillmentMode"] });
    }
    if (group.id === "balloons" && group.fulfillmentMode === "pickup" && group.pickup.timing !== "SCHEDULED") {
      context.addIssue({ code: "custom", message: "Balloon pickup must be scheduled.", path: ["groups", index, "pickup"] });
    }
  });
});

export const orderProPaidCheckoutResponseSchema = z.object({
  ok: z.literal(true),
  replayed: z.boolean(),
  checkout: z.object({
    id: z.string().uuid(),
    status: z.enum(["PAID", "IN_PROGRESS", "COMPLETED", "EXCEPTION"]),
    checkoutAttemptId: stableId,
    squareOrderId: stableId,
    squarePaymentId: stableId,
    groups: z.array(z.object({
      id: z.string().uuid(),
      groupKey: checkoutGroupIdSchema,
      status: z.enum(["NEW", "PREPARING", "READY", "COMPLETED", "EXCEPTION"]),
      employeeQueue: z.enum(["PICKUP_ASAP", "PICKUP_SCHEDULED", "LOCAL_DELIVERY", "SHIPPING"])
    }).strict()).min(1).max(2)
  }).strict()
}).strict();

export type OrderProPaidCheckout = z.infer<typeof orderProPaidCheckoutSchema>;
export type OrderProPaidCheckoutResponse = z.infer<typeof orderProPaidCheckoutResponseSchema>;
