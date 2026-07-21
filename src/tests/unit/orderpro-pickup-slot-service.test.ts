import { describe, expect, it } from "vitest";
import { earliestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";
import {
  getOrderProPickupAvailability,
  validateOrderProPickupSelection
} from "@/server/orderpro/orderpro-pickup-slot-service";

describe("OrderPro pickup slot gateway", () => {
  it("does not invent pickup slots before OrderPro returns them", async () => {
    const requestedDate = earliestNewYorkDeliveryDate();
    const availability = await getOrderProPickupAvailability({ locationId: "store-3rd-avenue", requestedDate });

    expect(availability).toMatchObject({
      available: true,
      source: "MOCK",
      locationId: "store-3rd-avenue",
      requestedDate
    });
    if (availability.available) {
      expect(availability.availableSlots).toEqual([]);
    }
  });

  it("rejects a slot that OrderPro no longer returns", async () => {
    const requestedDate = earliestNewYorkDeliveryDate();
    await expect(validateOrderProPickupSelection({
      locationId: "store-86th-street",
      requestedDate,
      slotId: "missing-slot"
    })).resolves.toMatchObject({ valid: false });
  });
});
