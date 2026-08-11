/**
 * Verifies the isolated behavior of delivery zone service.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateLocalDelivery,
  isValidDeliveryGeometry,
  pointInDeliveryGeometry,
  pointInPolygon,
  type DeliveryGeometry,
  type DeliveryZonePolicy
} from "@/features/fulfillment/services/delivery-zone-service";

const squareRing = [
  [-74, 40],
  [-73, 40],
  [-73, 41],
  [-74, 41],
  [-74, 40]
] as const;

const squareGeometry: DeliveryGeometry = {
  type: "Polygon",
  coordinates: [squareRing]
};

function zone(overrides: Partial<DeliveryZonePolicy> = {}): DeliveryZonePolicy {
  return {
    id: "zone-standard",
    locationId: "store-3rd-avenue",
    versionId: "zone-standard-v1",
    active: true,
    priority: 10,
    activeDays: ["MONDAY"],
    geometry: squareGeometry,
    baseFeeCents: 1_000,
    minimumOrderCents: 2_000,
    maxDistanceMiles: 5,
    maxRouteMinutes: 30,
    rateRules: [],
    ...overrides
  };
}

const eligibleInput = {
  locationId: "store-3rd-avenue",
  serviceDay: "MONDAY",
  point: [-73.5, 40.5] as const,
  subtotalCents: 6_000,
  distanceMiles: 2,
  routeMinutes: 12
};

describe("delivery zone geometry", () => {
  it("detects inside, outside, and boundary points for a legacy ring", () => {
    expect(pointInPolygon([-73.5, 40.5], squareRing)).toBe(true);
    expect(pointInPolygon([-72.5, 40.5], squareRing)).toBe(false);
    expect(pointInPolygon([-74, 40.5], squareRing)).toBe(true);
  });

  it("supports GeoJSON holes and excludes their boundaries", () => {
    const geometry: DeliveryGeometry = {
      type: "Polygon",
      coordinates: [
        squareRing,
        [
          [-73.8, 40.2],
          [-73.2, 40.2],
          [-73.2, 40.8],
          [-73.8, 40.8],
          [-73.8, 40.2]
        ]
      ]
    };

    expect(pointInDeliveryGeometry([-73.9, 40.5], geometry)).toBe(true);
    expect(pointInDeliveryGeometry([-73.5, 40.5], geometry)).toBe(false);
    expect(pointInDeliveryGeometry([-73.8, 40.5], geometry)).toBe(false);
  });

  it("fails closed for malformed or out-of-range GeoJSON", () => {
    expect(isValidDeliveryGeometry({ type: "Polygon", coordinates: [[[-181, 40], [-73, 40], [-73, 41], [-181, 40]]] })).toBe(false);
    expect(isValidDeliveryGeometry({ type: "Polygon", coordinates: [[[-74, 40], [-73, 40], [-73, 41], [-74, 41]]] })).toBe(false);
  });
});

describe("local delivery evaluation", () => {
  it("selects the highest-priority eligible overlapping zone and server fee rule", () => {
    const result = evaluateLocalDelivery(eligibleInput, [
      zone({ id: "zone-low", priority: 1, baseFeeCents: 1_500 }),
      zone({
        id: "zone-high",
        versionId: "zone-high-v2",
        priority: 20,
        rateRules: [
          { id: "standard", active: true, priority: 1, feeCents: 900 },
          { id: "orders-over-50", active: true, priority: 10, feeCents: 500, minimumSubtotalCents: 5_000 }
        ]
      })
    ]);

    expect(result).toMatchObject({
      eligible: true,
      reasonCode: "ELIGIBLE",
      zoneId: "zone-high",
      zoneVersionId: "zone-high-v2",
      feeCents: 500
    });
  });

  it("falls back to a lower-priority zone when its policy is the first eligible one", () => {
    const result = evaluateLocalDelivery(eligibleInput, [
      zone({ id: "zone-high", priority: 20, minimumOrderCents: 10_000 }),
      zone({ id: "zone-low", priority: 1, minimumOrderCents: 1_000, baseFeeCents: 1_500 })
    ]);

    expect(result).toMatchObject({ eligible: true, zoneId: "zone-low", feeCents: 1_500 });
  });

  it("returns stable failure reasons for missing or exceeded route metrics", () => {
    expect(evaluateLocalDelivery({ ...eligibleInput, distanceMiles: null }, [zone()])).toMatchObject({
      eligible: false,
      reasonCode: "ROUTE_METRICS_REQUIRED"
    });
    expect(evaluateLocalDelivery({ ...eligibleInput, distanceMiles: 5.1 }, [zone()])).toMatchObject({
      eligible: false,
      reasonCode: "DISTANCE_EXCEEDED",
      details: { maxDistanceMiles: 5 }
    });
    expect(evaluateLocalDelivery({ ...eligibleInput, routeMinutes: 31 }, [zone()])).toMatchObject({
      eligible: false,
      reasonCode: "ROUTE_TIME_EXCEEDED",
      details: { maxRouteMinutes: 30 }
    });
  });

  it("rejects unavailable days, outside points, and unmet minimums", () => {
    expect(evaluateLocalDelivery({ ...eligibleInput, serviceDay: "TUESDAY" }, [zone()]).reasonCode).toBe("SERVICE_DAY_UNAVAILABLE");
    expect(evaluateLocalDelivery({ ...eligibleInput, point: [-72.5, 40.5] }, [zone()]).reasonCode).toBe("OUTSIDE_ZONE");
    expect(evaluateLocalDelivery({ ...eligibleInput, subtotalCents: 1_999 }, [zone()])).toMatchObject({
      eligible: false,
      reasonCode: "MINIMUM_ORDER_NOT_MET",
      details: { minimumOrderCents: 2_000 }
    });
  });

  it("fails closed with no active zone or invalid shared configuration", () => {
    expect(evaluateLocalDelivery(eligibleInput, []).reasonCode).toBe("NO_ACTIVE_ZONE");
    expect(evaluateLocalDelivery(eligibleInput, [zone({ active: false })]).reasonCode).toBe("NO_ACTIVE_ZONE");
    const invalidZone = zone({
      geometry: { type: "Polygon", coordinates: [[[-74, 40], [-73, 40], [-73, 41]]] } as unknown as DeliveryGeometry
    });
    expect(evaluateLocalDelivery(eligibleInput, [invalidZone]).reasonCode).toBe("INVALID_ZONE_CONFIGURATION");
    expect(evaluateLocalDelivery(eligibleInput, [zone(), invalidZone]).reasonCode).toBe("INVALID_ZONE_CONFIGURATION");
  });

  it("rejects invalid client inputs before evaluating zones", () => {
    expect(evaluateLocalDelivery({ ...eligibleInput, subtotalCents: -1 }, [zone()]).reasonCode).toBe("INVALID_INPUT");
    expect(evaluateLocalDelivery({ ...eligibleInput, point: [200, 40] }, [zone()]).reasonCode).toBe("INVALID_INPUT");
  });
});
