/**
 * Verifies the isolated behavior of slot capacity service.
 */

import { describe, expect, it } from "vitest";
import {
  canReserveCapacity,
  capacityPointsForFulfillment,
  evaluateSlotAvailability,
  remainingCapacityPoints,
  type SlotAvailabilityInput
} from "@/features/fulfillment/services/slot-capacity-service";

const baseInput: SlotAvailabilityInput = {
  now: new Date("2026-07-16T13:00:00.000Z"),
  startsAt: new Date("2026-07-16T16:00:00.000Z"),
  endsAt: new Date("2026-07-16T17:00:00.000Z"),
  active: true,
  cutoffMinutes: 30,
  leadTimeMinutes: 60,
  capacity: {
    maxCapacityPoints: 10,
    confirmedCapacityPoints: 3,
    heldCapacityPoints: 2
  },
  requestedCapacityPoints: 2
};

describe("slot capacity service", () => {
  it("uses capacity points instead of order counts", () => {
    expect(capacityPointsForFulfillment("simple-mylar-pickup")).toBe(1);
    expect(capacityPointsForFulfillment("latex-bouquet-pickup")).toBe(3);
    expect(capacityPointsForFulfillment("large-arrangement")).toBe(8);
    expect(capacityPointsForFulfillment("local-delivery-stop")).toBe(2);
    expect(capacityPointsForFulfillment("same-day-rush")).toBe(2);
  });

  it("prevents reservation above slot capacity", () => {
    expect(canReserveCapacity({ maxCapacityPoints: 10, confirmedCapacityPoints: 6, heldCapacityPoints: 2 }, 3)).toBe(false);
    expect(canReserveCapacity({ maxCapacityPoints: 10, confirmedCapacityPoints: 6, heldCapacityPoints: 2 }, 2)).toBe(true);
  });

  it("fails closed for invalid capacity states and nonpositive requests", () => {
    expect(canReserveCapacity({ maxCapacityPoints: 10, confirmedCapacityPoints: -1, heldCapacityPoints: 0 }, 1)).toBe(false);
    expect(canReserveCapacity({ maxCapacityPoints: 10, confirmedCapacityPoints: 11, heldCapacityPoints: 0 }, 1)).toBe(false);
    expect(canReserveCapacity({ maxCapacityPoints: 10, confirmedCapacityPoints: 1, heldCapacityPoints: 0 }, 0)).toBe(false);
    expect(remainingCapacityPoints({ maxCapacityPoints: 10, confirmedCapacityPoints: 11, heldCapacityPoints: 0 })).toBe(0);
  });

  it("returns a deterministic available result with post-reservation capacity", () => {
    expect(evaluateSlotAvailability(baseInput)).toMatchObject({
      available: true,
      reasonCode: "AVAILABLE",
      remainingCapacityPoints: 3,
      bookingCutoffAt: new Date("2026-07-16T15:30:00.000Z"),
      earliestAllowedStartAt: new Date("2026-07-16T14:00:00.000Z")
    });
  });

  it("rejects inactive and already-started slots", () => {
    expect(evaluateSlotAvailability({ ...baseInput, active: false }).reasonCode).toBe("INACTIVE");
    expect(evaluateSlotAvailability({
      ...baseInput,
      now: new Date("2026-07-16T16:00:00.000Z")
    }).reasonCode).toBe("ALREADY_STARTED");
  });

  it("enforces lead time and booking cutoff independently", () => {
    expect(evaluateSlotAvailability({
      ...baseInput,
      startsAt: new Date("2026-07-16T14:00:00.000Z"),
      endsAt: new Date("2026-07-16T15:00:00.000Z"),
      leadTimeMinutes: 61,
      cutoffMinutes: 0
    }).reasonCode).toBe("LEAD_TIME_NOT_MET");

    expect(evaluateSlotAvailability({
      ...baseInput,
      now: new Date("2026-07-16T15:30:00.000Z"),
      leadTimeMinutes: 0
    }).reasonCode).toBe("CUTOFF_PASSED");
  });

  it("rejects requests that exceed remaining capacity", () => {
    expect(evaluateSlotAvailability({ ...baseInput, requestedCapacityPoints: 6 })).toMatchObject({
      available: false,
      reasonCode: "CAPACITY_EXCEEDED",
      remainingCapacityPoints: 5
    });
  });

  it("rejects malformed windows and invalid capacity before policy evaluation", () => {
    expect(evaluateSlotAvailability({
      ...baseInput,
      endsAt: new Date("2026-07-16T15:00:00.000Z")
    }).reasonCode).toBe("INVALID_INPUT");
    expect(evaluateSlotAvailability({
      ...baseInput,
      capacity: { maxCapacityPoints: 10, confirmedCapacityPoints: 9, heldCapacityPoints: 2 }
    }).reasonCode).toBe("INVALID_INPUT");
  });
});
