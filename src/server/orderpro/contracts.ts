/**
 * Implements server-side contracts behavior and persistence boundaries.
 */

import "server-only";

import { z } from "zod";
import { ORDERPRO_STAGING_SCOPES } from "@/server/orderpro/config";

export const ORDERPRO_STAGING_CLIENT_KEY = "storefront-staging";
export const ORDERPRO_MAX_RESPONSE_BYTES = 32 * 1024;

export const orderProStableIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const orderProCorrelationIdSchema = orderProStableIdSchema.max(120);
export const orderProIdempotencyKeySchema = orderProStableIdSchema.min(8).max(160);
const externalIdSchema = orderProStableIdSchema.max(160);
const instantSchema = z.iso.datetime({ offset: true });

export const orderProAuthCheckSuccessSchema = z
  .object({
    result: z.literal("AUTHENTICATED"),
    clientId: z.literal(ORDERPRO_STAGING_CLIENT_KEY),
    environment: z.literal("STAGING"),
    scopes: z.tuple([
      z.literal(ORDERPRO_STAGING_SCOPES[0]),
      z.literal(ORDERPRO_STAGING_SCOPES[1])
    ]),
    localDeliveryApiStatus: z.literal("DEPENDENCY_BLOCKED"),
    correlationId: orderProCorrelationIdSchema
  })
  .strict();

export const orderProAuthCheckFailureSchema = z.discriminatedUnion("result", [
  z
    .object({
      result: z.literal("UNAUTHORIZED"),
      code: z.literal("UNAUTHORIZED"),
      correlationId: orderProCorrelationIdSchema
    })
    .strict(),
  z
    .object({
      result: z.literal("FORBIDDEN"),
      code: z.literal("INSUFFICIENT_SCOPE"),
      correlationId: orderProCorrelationIdSchema
    })
    .strict(),
  z
    .object({
      result: z.literal("FAILED_CLOSED"),
      code: z.literal("M2M_AUTH_NOT_CONFIGURED"),
      correlationId: orderProCorrelationIdSchema
    })
    .strict()
]);

export const orderProAddressSchema = z
  .object({
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).nullable(),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().length(2),
    postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
    country: z.string().trim().length(2)
  })
  .strict();

export const orderProQuoteRequestSchema = z
  .object({
    address: orderProAddressSchema,
    cartLines: z
      .array(
        z
          .object({
            variantId: externalIdSchema,
            quantity: z.number().int().min(1).max(999)
          })
          .strict()
      )
      .min(1)
      .max(100),
    requestedDate: z.iso.date()
  })
  .strict();

const normalizedAddressSchema = orderProAddressSchema
  .extend({ borough: z.literal("Manhattan") })
  .strict();
const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180)
  })
  .strict();
const slotSchema = z
  .object({
    slotId: externalIdSchema,
    locationId: externalIdSchema,
    startsAt: instantSchema,
    endsAt: instantSchema,
    remainingCapacitySeconds: z.number().int().nonnegative(),
    capacityOrders: z.number().int().nonnegative().optional(),
    remainingOrders: z.number().int().nonnegative().optional(),
    pickupUntilAt: instantSchema.nullable().optional()
  })
  .strict();
const candidateRouteSchema = z
  .object({
    locationId: externalIdSchema,
    locationPriority: z.number().int(),
    walkingDistanceFeet: z.number().int().nonnegative(),
    walkingDurationSeconds: z.number().int().nonnegative(),
    routingProvider: z.string().min(1).max(80)
  })
  .strict();

const quoteOfferCommon = z
  .object({
    quoteId: externalIdSchema,
    replayed: z.boolean(),
    eligible: z.literal(true),
    normalizedAddress: normalizedAddressSchema,
    coordinates: coordinatesSchema,
    postalCode: z.string().regex(/^\d{5}$/),
    selectedLocationId: externalIdSchema,
    selectedLocationName: z.string().min(1).max(200),
    assignmentRule: z.enum(["FIXED_POSTAL_ZONE", "NEAREST_WALKING_ROUTE"]),
    walkingDistanceFeet: z.number().int().nonnegative(),
    walkingDurationSeconds: z.number().int().nonnegative(),
    roundTripDistanceFeet: z.number().int().nonnegative(),
    estimatedRoundTripDurationSeconds: z.number().int().nonnegative(),
    requiredCapacitySeconds: z.number().int().positive(),
    feeCents: z.number().int().nonnegative(),
    currency: z.literal("USD"),
    feeTierId: externalIdSchema,
    candidateRoutes: z.array(candidateRouteSchema).min(1).max(2),
    availableSlots: z.array(slotSchema),
    inventoryStatus: z.enum(["READY", "TRANSFER_REQUIRED"]),
    transferEarliestReadyAt: instantSchema.nullable(),
    inventoryOwnerLocationIds: z.array(externalIdSchema).min(1),
    inventoryNodeIds: z.array(externalIdSchema).min(1),
    zoneVersionId: externalIdSchema,
    feePolicyVersionId: externalIdSchema,
    routingProvider: z.string().min(1).max(80),
    routingProfile: z.literal("walking"),
    routeCalculatedAt: instantSchema,
    expiresAt: instantSchema,
    correlationId: orderProCorrelationIdSchema
  })
  .strict();

export const orderProQuoteOfferSchema = z.union([
  quoteOfferCommon
    .extend({
      bookable: z.literal(true),
      reasonCode: z.enum(["ELIGIBLE", "TRANSFER_REQUIRED"])
    })
    .strict(),
  quoteOfferCommon
    .extend({
      bookable: z.literal(false),
      reasonCode: z.literal("NO_SLOTS_FOR_SELECTED_LOCATION")
    })
    .strict()
]);

export const orderProContactStoreQuoteSchema = z
  .object({
    quoteId: externalIdSchema,
    replayed: z.boolean(),
    eligible: z.literal(false),
    bookable: z.literal(false),
    reasonCode: z.literal("CONTACT_STORE"),
    storefrontMessage: z.literal("Contact store"),
    normalizedAddress: normalizedAddressSchema,
    coordinates: coordinatesSchema,
    postalCode: z.string().regex(/^\d{5}$/),
    correlationId: orderProCorrelationIdSchema,
    expiresAt: instantSchema
  })
  .strict();

export const orderProQuoteResultSchema = z.union([
  orderProQuoteOfferSchema,
  orderProContactStoreQuoteSchema
]);

export const orderProCreateHoldRequestSchema = z
  .object({
    quoteId: externalIdSchema,
    slotId: externalIdSchema
  })
  .strict();

export const orderProHoldSchema = z
  .object({
    capacityHoldId: externalIdSchema,
    quoteId: externalIdSchema,
    slotId: externalIdSchema,
    locationId: externalIdSchema,
    clientId: externalIdSchema,
    correlationId: orderProCorrelationIdSchema,
    inventoryReservationId: externalIdSchema,
    capacitySeconds: z.number().int().positive(),
    status: z.enum(["HELD", "CONFIRMED", "RELEASED", "EXPIRED"]),
    createdAt: instantSchema,
    expiresAt: instantSchema,
    confirmedOrderId: externalIdSchema.nullable(),
    confirmedAt: instantSchema.nullable(),
    releasedAt: instantSchema.nullable(),
    releaseReason: z
      .enum([
        "QUOTE_EXPIRED",
        "ORDER_CANCELLED",
        "PAYMENT_FAILED",
        "INVENTORY_UNAVAILABLE",
        "CAPACITY_UNAVAILABLE",
        "MANUAL"
      ])
      .nullable()
  })
  .strict();

export const orderProCreateHoldResultSchema = z
  .object({ hold: orderProHoldSchema, replayed: z.boolean() })
  .strict();
export const orderProGetHoldResultSchema = z.object({ hold: orderProHoldSchema }).strict();
export const orderProHoldTransitionResultSchema = z
  .object({ hold: orderProHoldSchema, changed: z.boolean() })
  .strict();

export const orderProConfirmHoldRequestSchema = z
  .object({ orderId: externalIdSchema })
  .strict();
export const orderProReleaseHoldRequestSchema = z
  .object({ reason: z.enum(["ORDER_CANCELLED", "PAYMENT_FAILED", "MANUAL"]) })
  .strict();

export const orderProErrorResponseSchema = z
  .object({
    code: z.string().min(1).max(120).regex(/^[A-Z0-9_]+$/),
    message: z.string().min(1).max(1000),
    correlationId: orderProCorrelationIdSchema
  })
  .strict();

export const orderProFulfillmentStatusLookupSchema = z.union([
  z.object({ checkoutAttemptId: externalIdSchema }).strict(),
  z.object({ squareOrderId: orderProStableIdSchema.max(192) }).strict(),
  z.object({ squarePaymentId: orderProStableIdSchema.max(192) }).strict(),
  z.object({ orderproOrderId: z.string().uuid() }).strict()
]);

export const orderProFulfillmentStatusSchema = z.object({
  checkoutAttemptId: externalIdSchema,
  orderproOrderId: z.string().uuid(),
  fulfillmentMode: z.enum(["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]),
  normalizedStatus: z.enum([
    "RESERVED",
    "PAYMENT_PENDING",
    "CONFIRMED",
    "FULFILLING",
    "COMPLETED",
    "EXPIRED",
    "CANCELLED",
    "RELEASED",
    "RECONCILIATION_REQUIRED"
  ]),
  nativeStatus: z.string().min(1).max(80),
  reservationId: z.string().uuid(),
  squareOrderId: orderProStableIdSchema.max(192).nullable(),
  squarePaymentLinkId: orderProStableIdSchema.max(192).nullable(),
  squarePaymentId: orderProStableIdSchema.max(192).nullable(),
  expiresAt: instantSchema,
  amountPaidCents: z.number().int().nonnegative().nullable(),
  currency: z.literal("USD").nullable(),
  version: z.number().int().positive(),
  updatedAt: instantSchema,
  requiresIntervention: z.boolean()
}).strict();

export const orderProFulfillmentStatusResultSchema = z.object({
  ok: z.literal(true),
  status: orderProFulfillmentStatusSchema,
  correlationId: orderProCorrelationIdSchema
}).strict();

const pickupCartLineSchema = z.object({
  squareVariationId: externalIdSchema,
  quantity: z.number().int().min(1).max(999)
}).strict();

export const orderProPickupQuoteRequestSchema = z.object({
  locationId: z.enum(["third_avenue", "east_86th_street"]),
  requestedDate: z.iso.date(),
  cartLines: z.array(pickupCartLineSchema).min(1).max(100)
}).strict();

const pickupAvailableSlotSchema = z.object({
  slotId: externalIdSchema,
  slotClass: z.literal("STANDARD"),
  startsAt: instantSchema,
  endsAt: instantSchema,
  pickupUntilAt: instantSchema.nullable(),
  capacityOrders: z.number().int().nonnegative(),
  remainingOrders: z.number().int().positive()
}).strict();

export const orderProPickupQuoteResultSchema = z.object({
  ok: z.literal(true),
  quoteId: z.string().uuid(),
  quoteClientId: externalIdSchema.max(120),
  replayed: z.boolean(),
  mode: z.literal("PICKUP"),
  eligible: z.literal(true),
  bookable: z.literal(true),
  reservationCapability: z.literal("HOLD_READY"),
  locationId: z.enum(["third_avenue", "east_86th_street"]),
  requestedDate: z.iso.date(),
  requiredCapacityOrders: z.literal(1),
  holdTtlSeconds: z.number().int().min(30).max(3600),
  availableSlots: z.array(pickupAvailableSlotSchema).min(1).max(8),
  expiresAt: instantSchema,
  correlationId: orderProCorrelationIdSchema
}).strict();

export const orderProPickupReservationRequestSchema = z.object({
  quoteId: z.string().uuid(),
  slotId: externalIdSchema,
  checkoutAttemptId: externalIdSchema
}).strict();

export const orderProPickupReservationResultSchema = z.object({
  ok: z.literal(true),
  replayed: z.boolean(),
  checkoutAttemptId: externalIdSchema,
  fulfillmentMode: z.literal("PICKUP"),
  hold: orderProHoldSchema
}).strict();

const orderProCapacityCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(40),
  address: orderProAddressSchema.nullable()
}).strict();

const orderProCapacityCheckoutSchema = z.object({
  capacityHoldId: z.string().uuid(),
  checkoutAttemptId: externalIdSchema,
  fulfillmentMode: z.enum(["PICKUP", "WALKING_LOCAL_DELIVERY"]),
  status: z.enum([
    "RESERVED", "BOUND", "PAID", "RELEASED", "EXPIRED", "CANCELLED",
    "PAYMENT_EXCEPTION", "RECONCILIATION_REQUIRED"
  ]),
  expiresAt: instantSchema,
  squareOrderId: orderProStableIdSchema.max(192).nullable(),
  squarePaymentLinkId: orderProStableIdSchema.max(192).nullable(),
  squarePaymentId: orderProStableIdSchema.max(192).nullable(),
  squareLocationId: orderProStableIdSchema.max(192).nullable(),
  amountPaidCents: z.number().int().nonnegative().nullable(),
  currency: z.literal("USD").nullable(),
  boundAt: instantSchema.nullable(),
  paidAt: instantSchema.nullable(),
  releasedAt: instantSchema.nullable(),
  releaseReason: z.string().max(80).nullable(),
  version: z.number().int().positive()
}).strict();

export const orderProBindCapacityCheckoutRequestSchema = z.object({
  capacityHoldId: z.string().uuid(),
  squareOrderId: orderProStableIdSchema.max(192),
  squarePaymentLinkId: orderProStableIdSchema.max(192),
  squareLocationId: orderProStableIdSchema.max(192)
}).strict();

export const orderProConfirmCapacityCheckoutRequestSchema = z.object({
  capacityHoldId: z.string().uuid(),
  squareOrderId: orderProStableIdSchema.max(192),
  squarePaymentId: orderProStableIdSchema.max(192),
  squareLocationId: orderProStableIdSchema.max(192),
  amountPaidCents: z.number().int().nonnegative().max(100_000_000),
  currency: z.literal("USD"),
  paidAt: instantSchema,
  customer: orderProCapacityCustomerSchema
}).strict();

export const orderProReleaseCapacityCheckoutRequestSchema = z.object({
  capacityHoldId: z.string().uuid(),
  reason: z.enum(["CHECKOUT_FAILED", "PAYMENT_FAILED", "ABANDONED", "MANUAL"])
}).strict();

export const orderProCapacityCheckoutMutationResultSchema = z.object({
  ok: z.literal(true),
  checkout: orderProCapacityCheckoutSchema,
  hold: orderProHoldSchema,
  changed: z.boolean()
}).strict();

export type OrderProAuthCheckSuccess = z.infer<typeof orderProAuthCheckSuccessSchema>;
export type OrderProAuthCheckFailure = z.infer<typeof orderProAuthCheckFailureSchema>;
export type OrderProQuoteRequest = z.input<typeof orderProQuoteRequestSchema>;
export type OrderProQuoteResult = z.infer<typeof orderProQuoteResultSchema>;
export type OrderProCreateHoldRequest = z.input<typeof orderProCreateHoldRequestSchema>;
export type OrderProHold = z.infer<typeof orderProHoldSchema>;
export type OrderProCreateHoldResult = z.infer<typeof orderProCreateHoldResultSchema>;
export type OrderProGetHoldResult = z.infer<typeof orderProGetHoldResultSchema>;
export type OrderProHoldTransitionResult = z.infer<typeof orderProHoldTransitionResultSchema>;
export type OrderProReleaseReason = z.input<typeof orderProReleaseHoldRequestSchema>["reason"];
export type OrderProErrorResponse = z.infer<typeof orderProErrorResponseSchema>;
export type OrderProFulfillmentStatusLookup = z.input<typeof orderProFulfillmentStatusLookupSchema>;
export type OrderProFulfillmentStatusResult = z.infer<typeof orderProFulfillmentStatusResultSchema>;
export type OrderProPickupQuoteRequest = z.input<typeof orderProPickupQuoteRequestSchema>;
export type OrderProPickupQuoteResult = z.infer<typeof orderProPickupQuoteResultSchema>;
export type OrderProPickupReservationRequest = z.input<typeof orderProPickupReservationRequestSchema>;
export type OrderProPickupReservationResult = z.infer<typeof orderProPickupReservationResultSchema>;
export type OrderProBindCapacityCheckoutRequest = z.input<typeof orderProBindCapacityCheckoutRequestSchema>;
export type OrderProConfirmCapacityCheckoutRequest = z.input<typeof orderProConfirmCapacityCheckoutRequestSchema>;
export type OrderProReleaseCapacityCheckoutRequest = z.input<typeof orderProReleaseCapacityCheckoutRequestSchema>;
export type OrderProCapacityCheckoutMutationResult = z.infer<typeof orderProCapacityCheckoutMutationResultSchema>;
