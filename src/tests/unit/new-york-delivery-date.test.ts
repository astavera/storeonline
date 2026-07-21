import { describe, expect, it } from "vitest";
import {
  earliestNewYorkDeliveryDate,
  isWithinNewYorkDeliveryWindow,
  newYorkUtcOffsetForDate
} from "@/features/fulfillment/utils/new-york-delivery-date";

describe("New York delivery dates", () => {
  it("returns the next New York calendar day even after UTC has advanced", () => {
    expect(earliestNewYorkDeliveryDate(new Date("2026-07-20T01:30:00.000Z"))).toBe("2026-07-20");
  });

  it("uses the correct seasonal UTC offset", () => {
    expect(newYorkUtcOffsetForDate("2026-07-20")).toBe("-04:00");
    expect(newYorkUtcOffsetForDate("2026-12-20")).toBe("-05:00");
  });

  it("rejects past and excessively distant delivery dates", () => {
    const now = new Date("2026-07-19T16:00:00.000Z");
    expect(isWithinNewYorkDeliveryWindow("2026-07-19", now)).toBe(false);
    expect(isWithinNewYorkDeliveryWindow("2026-07-20", now)).toBe(true);
    expect(isWithinNewYorkDeliveryWindow("2026-10-18", now)).toBe(false);
  });
});
