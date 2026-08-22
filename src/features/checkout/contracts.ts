/** Shared, versioned contracts for the split-fulfillment storefront checkout. */

import { z } from "zod";

export const checkoutGroupIdSchema = z.enum(["regular", "balloons"]);
export const checkoutFulfillmentModeSchema = z.enum(["pickup", "local-delivery", "shipping"]);

export const checkoutAddressSchema = z.object({
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(80).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  country: z.literal("US")
}).strict();

export const checkoutPickupSelectionSchema = z.discriminatedUnion("timing", [
  z.object({ timing: z.literal("ASAP") }).strict(),
  z.object({
    timing: z.literal("SCHEDULED"),
    requestedDate: z.string().date(),
    slotId: z.string().trim().min(3).max(160),
    slotLabel: z.string().trim().min(3).max(80)
  }).strict()
]);

export const checkoutLocalDeliverySelectionSchema = z.object({
  quoteId: z.string().trim().min(8).max(200),
  slotId: z.string().trim().min(8).max(200),
  feeCents: z.number().int().nonnegative(),
  requestedDate: z.string().date(),
  address: checkoutAddressSchema
}).strict();

export const checkoutShippingSelectionSchema = z.object({
  quoteToken: z.string().trim().min(8).max(4_096),
  rateId: z.string().trim().min(1).max(200),
  amountCents: z.number().int().nonnegative(),
  carrier: z.string().trim().min(1).max(80),
  serviceName: z.string().trim().min(1).max(120),
  readyToShipDate: z.string().date(),
  address: checkoutAddressSchema
}).strict();

export const checkoutFulfillmentGroupSelectionSchema = z.object({
  id: checkoutGroupIdSchema,
  fulfillmentMode: checkoutFulfillmentModeSchema,
  locationId: z.string().trim().min(1).max(160),
  pickup: checkoutPickupSelectionSchema.optional(),
  localDelivery: checkoutLocalDeliverySelectionSchema.optional(),
  shipping: checkoutShippingSelectionSchema.optional()
}).strict();

export const splitCheckoutRequestSchema = z.object({
  version: z.literal(2),
  items: z.array(z.object({
    squareVariationId: z.string().min(1),
    quantity: z.number().int().positive().max(99),
    source: z.enum(["storefront", "balloons"]).optional()
  }).strict()).min(1).max(50),
  fulfillmentGroups: z.array(checkoutFulfillmentGroupSelectionSchema).min(1).max(2)
    .superRefine((groups, context) => {
      if (new Set(groups.map((group) => group.id)).size !== groups.length) {
        context.addIssue({ code: "custom", message: "Fulfillment group ids must be unique." });
      }
    }),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(7).max(40)
  }).strict()
}).strict();

export type CheckoutFulfillmentGroupSelection = z.infer<typeof checkoutFulfillmentGroupSelectionSchema>;
export type SplitCheckoutRequest = z.infer<typeof splitCheckoutRequestSchema>;
