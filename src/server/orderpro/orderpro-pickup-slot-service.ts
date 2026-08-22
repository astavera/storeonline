/**
 * Implements server-side OrderPro pickup slot service behavior and persistence boundaries.
 */

import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { storeLocations } from "@/config/locations.config";
import type { OrderProPickupAvailability } from "@/features/fulfillment/contracts/orderpro-pickup";
import {
  currentNewYorkDate,
  isWithinNewYorkDeliveryWindow,
  latestNewYorkDeliveryDate
} from "@/features/fulfillment/utils/new-york-delivery-date";
import { getOrderProStorefrontFulfillmentClient } from "@/server/orderpro/storefront-fulfillment-client";

const cartLineSchema = z.object({
  squareVariationId: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(999)
}).strict();

export const orderProPickupAvailabilityRequestSchema = z.object({
  locationId: z.string().trim().min(1).max(160),
  requestedDate: z.string().date(),
  cartLines: z.array(cartLineSchema).min(1).max(100),
  context: z.enum(["regular", "balloons"]).default("balloons")
}).superRefine((value, context) => {
  const valid = value.context === "balloons"
    ? isWithinNewYorkDeliveryWindow(value.requestedDate)
    : value.requestedDate >= currentNewYorkDate() && value.requestedDate <= latestNewYorkDeliveryDate();
  if (!valid) {
    context.addIssue({
      code: "custom",
      message: value.context === "balloons"
        ? "Balloon pickup dates must be between tomorrow and 90 days from today."
        : "Pickup dates must be between today and 90 days from today.",
      path: ["requestedDate"]
    });
  }
});

export type OrderProPickupSelectionInput = {
  locationId: string;
  requestedDate: string;
  slotId: string;
  cartLines: Array<z.infer<typeof cartLineSchema>>;
  context?: "regular" | "balloons";
};

export function isOrderProPickupTestMode() {
  return process.env.NODE_ENV !== "production";
}

export async function getOrderProPickupAvailability(
  input: unknown,
  options?: { quoteRequestId?: string }
): Promise<OrderProPickupAvailability> {
  const parsed = orderProPickupAvailabilityRequestSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID_REQUEST", "Choose a valid pickup store and date.");

  const location = storeLocations.find((candidate) => candidate.id === parsed.data.locationId && candidate.pickupEnabled);
  if (!location) return failure("LOCATION_UNAVAILABLE", "This store is not available for pickup.");

  if (!isOrderProPickupTestMode()) {
    const client = getOrderProStorefrontFulfillmentClient();
    if (!client) {
      return failure(
        "ORDERPRO_NOT_CONFIGURED",
        "Pickup times are temporarily unavailable. Please try again or contact the store.",
        "ORDERPRO"
      );
    }

    const orderProLocationId = parsed.data.locationId === "store-3rd-avenue"
      ? "third_avenue"
      : "east_86th_street";
    try {
      const cartLines = canonicalCartLines(parsed.data.cartLines);
      const quoteRequestId = options?.quoteRequestId?.trim() || randomUUID();
      const identity = quoteIdentity("pickup", {
        locationId: orderProLocationId,
        requestedDate: parsed.data.requestedDate,
        cartLines
      }, quoteRequestId);
      const availability = await client.quotePickup({
        locationId: orderProLocationId,
        requestedDate: parsed.data.requestedDate,
        cartLines,
        ...identity
      });
      const availableSlots = availability.availableSlots
        .filter((slot) => parsed.data.context === "balloons" || Date.parse(slot.startsAt) - Date.now() >= 120 * 60_000)
        .map((slot) => ({
          id: slot.slotId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          label: slotLabel(slot.startsAt, slot.endsAt)
        }));
      if (availableSlots.length === 0) {
        return failure("NO_AVAILABLE_SLOTS", "No pickup times at least two hours from now are available for this date.", "ORDERPRO");
      }
      return {
        available: true,
        source: "ORDERPRO",
        quoteId: availability.quoteId,
        locationId: parsed.data.locationId,
        requestedDate: availability.requestedDate,
        availableSlots,
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

export async function validateOrderProPickupSelection(
  input: OrderProPickupSelectionInput,
  options?: { quoteRequestId?: string }
) {
  const availability = await getOrderProPickupAvailability({
    locationId: input.locationId,
    requestedDate: input.requestedDate,
    cartLines: input.cartLines.map(({ squareVariationId, quantity }) => ({ squareVariationId, quantity })),
    context: input.context
  }, options);
  if (!availability.available) return { valid: false as const, message: availability.message };

  const slot = availability.availableSlots.find((candidate) => candidate.id === input.slotId);
  const valid = Boolean(slot) && Date.parse(availability.expiresAt) > Date.now();
  return valid
    ? { valid: true as const, availability, slot: slot! }
    : { valid: false as const, message: "The pickup time is no longer available. Choose another time." };
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

function canonicalCartLines(lines: Array<z.infer<typeof cartLineSchema>>) {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    quantities.set(line.squareVariationId, (quantities.get(line.squareVariationId) ?? 0) + line.quantity);
  }
  return [...quantities]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([squareVariationId, quantity]) => ({ squareVariationId, quantity }));
}

function quoteIdentity(mode: string, request: unknown, quoteRequestId: string) {
  const digest = createHash("sha256")
    .update(JSON.stringify({ quoteRequestId, request }))
    .digest("hex");
  return {
    idempotencyKey: `${mode}-quote:${digest}`,
    correlationId: `${mode}-quote:${digest.slice(0, 48)}`
  };
}
