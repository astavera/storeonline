import { describe, expect, it } from "vitest";
import { canReserveCapacity, capacityPointsForFulfillment } from "@/features/fulfillment/services/slot-capacity-service";

describe("slot capacity service", () => {
  it("uses capacity points instead of order counts", () => {
    expect(capacityPointsForFulfillment("simple-mylar-pickup")).toBe(1);
    expect(capacityPointsForFulfillment("latex-bouquet-pickup")).toBe(3);
    expect(capacityPointsForFulfillment("large-arrangement")).toBe(8);
  });

  it("prevents reservation above slot capacity", () => {
    expect(canReserveCapacity({ maxCapacityPoints: 10, confirmedCapacityPoints: 6, heldCapacityPoints: 2 }, 3)).toBe(false);
    expect(canReserveCapacity({ maxCapacityPoints: 10, confirmedCapacityPoints: 6, heldCapacityPoints: 2 }, 2)).toBe(true);
  });
});
