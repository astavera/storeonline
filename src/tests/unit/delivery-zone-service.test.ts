import { describe, expect, it } from "vitest";
import { pointInPolygon } from "@/features/fulfillment/services/delivery-zone-service";

describe("delivery zone service", () => {
  const square: Array<[number, number]> = [
    [-74.0, 40.0],
    [-73.0, 40.0],
    [-73.0, 41.0],
    [-74.0, 41.0]
  ];

  it("detects a point inside a polygon", () => {
    expect(pointInPolygon([-73.5, 40.5], square)).toBe(true);
  });

  it("rejects a point outside a polygon", () => {
    expect(pointInPolygon([-72.5, 40.5], square)).toBe(false);
  });
});
