/**
 * Implements server-side OrderPro pickup slot service behavior and persistence boundaries.
 */

import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { storeLocations } from "@/config/locations.config";
import type { OrderProPickupAvailability } from "@/features/fulfillment/contracts/orderpro-pickup";
import { isWithinNewYorkDeliveryWindow } from "@/features/fulfillment/utils/new-york-delivery-date";
import { getRuntimeOrderProClient } from "@/server/orderpro/runtime";

const pickupCartLineSchema = z.object({
  squareVariationId: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(99)
}).strict();

export const orderProPickupAvailabilityRequestSchema = z.object({
  locationId: z.string().trim().min(1).max(160),
  requestedDate: z.string().date().refine((value) => isWithinNewYorkDeliveryWindow(value), {
    message: "Pickup dates must be between tomorrow and 90 days from today."
  }),
  items: z.array(pickupCartLineSchema).min(1).max(50).optional()
}).strict();

export type OrderProPickupSelectionInput = {
  locationId: string;
  requestedDate: string;
  slotId: string;
  quoteId: string;
  items: Array<{ squareVariationId: string; quantity: number }>;
};

export function isOrderProPickupTestMode() {
  return process.env.NODE_ENV !== "production";
}

export async function getOrderProPickupAvailability(input: unknown): Promise<OrderProPickupAvailability> {
  const parsed = orderProPickupAvailabilityRequestSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID_REQUEST", "Choose a valid pickup store and date.");

  const location = storeLocations.find((candidate) => candidate.id === parsed.data.locationId && candidate.pickupEnabled);
  if (!location) return failure("LOCATION_UNAVAILABLE", "This store is not available for pickup.");

  if (!isOrderProPickupTestMode()) {
    if (!parsed.data.items) {
      return failure("INVALID_REQUEST", "Pickup inventory requires the current cart.", "ORDERPRO");
    }
    const runtime = getRuntimeOrderProClient();
    if (!runtime.ready) {
      return failure(
        "ORDERPRO_NOT_CONFIGURED",
        "Pickup times are temporarily unavailable. Please try again or contact the store.",
        "ORDERPRO"
      );
    }

    const orderProLocationId = orderProPickupLocationId(parsed.data.locationId);
    if (!orderProLocationId) {
      return failure("LOCATION_UNAVAILABLE", "This store is not available for pickup.", "ORDERPRO");
    }
    const identity = pickupQuoteIdentity({
      locationId: orderProLocationId,
      requestedDate: parsed.data.requestedDate,
      items: parsed.data.items
    });
    try {
      const availability = await runtime.client.pickupQuote({
        locationId: orderProLocationId,
        requestedDate: parsed.data.requestedDate,
        cartLines: parsed.data.items
      }, {
        idempotencyKey: identity,
        correlationId: identity
      });
      return {
        available: true,
        source: "ORDERPRO",
        quoteId: availability.quoteId,
        locationId: parsed.data.locationId,
        requestedDate: availability.requestedDate,
        availableSlots: availability.availableSlots.map((slot) => ({
          id: slot.slotId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          label: slotLabel(slot.startsAt, slot.endsAt)
        })),
        expiresAt: availability.expiresAt
      };
    } catch {
      return failure(
        "ORDERPRO_UNAVAILABLE",
        "Pickup times are temporarily unavailable. Please try again or contact the store.",
        "ORDERPRO"
      );
    }
  }

  return {
    available: true,
    source: "MOCK",
    quoteId: null,
    locationId: parsed.data.locationId,
    requestedDate: parsed.data.requestedDate,
    availableSlots: [],
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
  };
}

export async function validateOrderProPickupSelection(input: OrderProPickupSelectionInput) {
  const parsedQuoteId = z.string().uuid().safeParse(input.quoteId);
  if (!parsedQuoteId.success) {
    return { valid: false as const, message: "The pickup quote is invalid. Choose a pickup time again." };
  }
  const availability = await getOrderProPickupAvailability(input);
  if (!availability.available) return { valid: false as const, message: availability.message };

  const slot = availability.availableSlots.find((candidate) => candidate.id === input.slotId);
  const valid = availability.quoteId === parsedQuoteId.data && Boolean(slot)
    && Date.parse(availability.expiresAt) > Date.now();
  return valid
    ? { valid: true as const, availability, slot: slot! }
    : { valid: false as const, message: "The pickup time is no longer available. Choose another time." };
}

export function orderProPickupLocationId(locationId: string) {
  if (locationId === "store-3rd-avenue") return "third_avenue" as const;
  if (locationId === "store-86th-street") return "east_86th_street" as const;
  return null;
}

export function pickupQuoteIdentity(input: {
  locationId: string;
  requestedDate: string;
  items: Array<{ squareVariationId: string; quantity: number }>;
}) {
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  return `pickup-quote:v1:${digest}`;
}

function failure(
  reasonCode: Extract<OrderProPickupAvailability, { available: false }>["reasonCode"],
  message: string,
  source: OrderProPickupAvailability["source"] = "MOCK"
): OrderProPickupAvailability {
  return { available: false, source, reasonCode, message };
}

function slotLabel(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))}`;
}
