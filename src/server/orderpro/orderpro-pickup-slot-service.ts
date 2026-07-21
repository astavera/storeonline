import "server-only";

import { z } from "zod";
import { storeLocations } from "@/config/locations.config";
import type { OrderProPickupAvailability } from "@/features/fulfillment/contracts/orderpro-pickup";
import { isWithinNewYorkDeliveryWindow } from "@/features/fulfillment/utils/new-york-delivery-date";

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
  return process.env.NODE_ENV !== "production"
    || process.env.E2E_CATALOG_FIXTURE === "true"
    || process.env.ORDERPRO_PICKUP_TEST_MODE === "true";
}

export async function getOrderProPickupAvailability(input: unknown): Promise<OrderProPickupAvailability> {
  const parsed = orderProPickupAvailabilityRequestSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID_REQUEST", "Choose a valid pickup store and date.");

  const location = storeLocations.find((candidate) => candidate.id === parsed.data.locationId && candidate.pickupEnabled);
  if (!location) return failure("LOCATION_UNAVAILABLE", "This store is not available for pickup.");

  if (!isOrderProPickupTestMode()) {
    return failure(
      process.env.ORDERPRO_API_URL ? "ORDERPRO_UNAVAILABLE" : "ORDERPRO_NOT_CONFIGURED",
      "Pickup times are temporarily unavailable. Please try again or contact the store."
    );
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

function failure(reasonCode: Extract<OrderProPickupAvailability, { available: false }>["reasonCode"], message: string): OrderProPickupAvailability {
  return { available: false, source: "MOCK", reasonCode, message };
}
