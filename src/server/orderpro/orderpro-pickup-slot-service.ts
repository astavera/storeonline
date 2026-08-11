/**
 * Implements server-side OrderPro pickup slot service behavior and persistence boundaries.
 */

import "server-only";

import { z } from "zod";
import { storeLocations } from "@/config/locations.config";
import type { OrderProPickupAvailability } from "@/features/fulfillment/contracts/orderpro-pickup";
import { isWithinNewYorkDeliveryWindow } from "@/features/fulfillment/utils/new-york-delivery-date";
import { getOrderProPrivatePreviewClient } from "@/server/orderpro/private-preview-client";

export const orderProPickupAvailabilityRequestSchema = z.object({
  locationId: z.string().trim().min(1).max(160),
  requestedDate: z.string().date().refine((value) => isWithinNewYorkDeliveryWindow(value), {
    message: "Pickup dates must be between tomorrow and 90 days from today."
  })
});

export type OrderProPickupSelectionInput = {
  locationId: string;
  requestedDate: string;
  slotId: string;
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
    const client = getOrderProPrivatePreviewClient();
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
      const availability = await client.getPickupAvailability({
        locationId: orderProLocationId,
        requestedDate: parsed.data.requestedDate
      });
      return {
        available: true,
        source: "ORDERPRO",
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
    locationId: parsed.data.locationId,
    requestedDate: parsed.data.requestedDate,
    availableSlots: [],
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
  };
}

export async function validateOrderProPickupSelection(input: OrderProPickupSelectionInput) {
  const availability = await getOrderProPickupAvailability(input);
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
