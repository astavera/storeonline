/**
 * Verifies the isolated behavior of local delivery routing service.
 */

import { describe, expect, it } from "vitest";
import {
  routeLocalWalkingDelivery,
  type WalkingDeliveryLocationPolicy,
  type WalkingDeliverySlotPolicy
} from "@/features/fulfillment/services/local-delivery-routing-service";
import type { DeliveryGeometry, DeliveryZonePolicy } from "@/features/fulfillment/services/delivery-zone-service";

const now = new Date("2026-07-16T13:00:00.000Z");
// Deliberately coarse deterministic fixture; this is not the production UES boundary.
const orangeWalkingArea: DeliveryGeometry = {
  type: "Polygon",
  coordinates: [[
    [-73.98, 40.75],
    [-73.92, 40.75],
    [-73.92, 40.80],
    [-73.98, 40.80],
    [-73.98, 40.75]
  ]]
};

function slot(overrides: Partial<WalkingDeliverySlotPolicy> = {}): WalkingDeliverySlotPolicy {
  return {
    id: "slot-afternoon",
    startsAt: new Date("2026-07-16T16:00:00.000Z"),
    endsAt: new Date("2026-07-16T17:00:00.000Z"),
    active: true,
    cutoffMinutes: 30,
    leadTimeMinutes: 60,
    capacity: {
      maxCapacityPoints: 10,
      confirmedCapacityPoints: 2,
      heldCapacityPoints: 1
    },
    ...overrides
  };
}

function zone(locationId: string, feeCents: number, overrides: Partial<DeliveryZonePolicy> = {}): DeliveryZonePolicy {
  return {
    id: `${locationId}-orange-zone`,
    locationId,
    versionId: `${locationId}-orange-zone-v1`,
    active: true,
    priority: 10,
    activeDays: ["THURSDAY"],
    geometry: orangeWalkingArea,
    baseFeeCents: feeCents,
    minimumOrderCents: 0,
    maxDistanceMiles: 3,
    maxRouteMinutes: 45,
    rateRules: [],
    ...overrides
  };
}

function location(
  id: string,
  walkingDistanceMiles: number,
  feeCents: number,
  overrides: Partial<WalkingDeliveryLocationPolicy> = {}
): WalkingDeliveryLocationPolicy {
  return {
    id,
    name: id === "store-3rd-avenue" ? "3rd Avenue Store" : "86th Street Store",
    localDeliveryEnabled: true,
    walkingDistanceMiles,
    walkingDurationMinutes: walkingDistanceMiles * 20,
    zones: [zone(id, feeCents)],
    slots: [slot({ id: `${id}-slot` })],
    ...overrides
  };
}

function routingInput(locations: readonly WalkingDeliveryLocationPolicy[]) {
  return {
    now,
    serviceDay: "THURSDAY",
    point: [-73.955, 40.775] as const,
    subtotalCents: 8_000,
    requestedCapacityPoints: 2,
    locations
  };
}

describe("local walking delivery routing", () => {
  it("routes an address in the orange overlap to the closest store and returns only its slots", () => {
    const result = routeLocalWalkingDelivery(routingInput([
      location("store-3rd-avenue", 0.4, 1_000, {
        slots: [
          slot({ id: "third-late", startsAt: new Date("2026-07-16T18:00:00.000Z"), endsAt: new Date("2026-07-16T19:00:00.000Z") }),
          slot({ id: "third-early" }),
          slot({ id: "third-full", capacity: { maxCapacityPoints: 5, confirmedCapacityPoints: 5, heldCapacityPoints: 0 } })
        ]
      }),
      location("store-86th-street", 1.1, 1_500)
    ]));

    expect(result).toMatchObject({
      routeFound: true,
      bookable: true,
      reasonCode: "READY",
      locationId: "store-3rd-avenue",
      feeCents: 1_000,
      walkingDistanceMiles: 0.4,
      availableSlots: [
        { id: "third-early", remainingCapacityPoints: 5 },
        { id: "third-late", remainingCapacityPoints: 5 }
      ]
    });
  });

  it("selects 86th Street when it has the shortest walking route and uses its standardized fee", () => {
    const result = routeLocalWalkingDelivery(routingInput([
      location("store-3rd-avenue", 1.3, 1_500),
      location("store-86th-street", 0.2, 0)
    ]));

    expect(result).toMatchObject({
      routeFound: true,
      bookable: true,
      locationId: "store-86th-street",
      feeCents: 0,
      zoneVersionId: "store-86th-street-orange-zone-v1"
    });
  });

  it("does not silently reroute to a farther store when the closest one has no slots", () => {
    const result = routeLocalWalkingDelivery(routingInput([
      location("store-3rd-avenue", 0.3, 1_000, {
        slots: [slot({ active: false })]
      }),
      location("store-86th-street", 0.8, 1_500)
    ]));

    expect(result).toMatchObject({
      routeFound: true,
      bookable: false,
      reasonCode: "NO_AVAILABLE_SLOTS",
      locationId: "store-3rd-avenue",
      availableSlots: []
    });
  });

  it("rejects an address outside every orange walking polygon", () => {
    const input = routingInput([
      location("store-3rd-avenue", 2, 1_500),
      location("store-86th-street", 3, 1_500)
    ]);

    expect(routeLocalWalkingDelivery({ ...input, point: [-73.99, 40.81] })).toMatchObject({
      routeFound: false,
      reasonCode: "OUTSIDE_WALKING_AREA",
      locationEvaluations: [
        { locationId: "store-3rd-avenue", reasonCode: "OUTSIDE_ZONE" },
        { locationId: "store-86th-street", reasonCode: "OUTSIDE_ZONE" }
      ]
    });
  });

  it("returns no eligible location when the point is covered but route limits fail", () => {
    expect(routeLocalWalkingDelivery(routingInput([
      location("store-3rd-avenue", 3.1, 1_500),
      location("store-86th-street", 3.2, 1_500)
    ]))).toMatchObject({
      routeFound: false,
      reasonCode: "NO_ELIGIBLE_LOCATION"
    });
  });

  it("fails closed when a candidate has malformed zone ownership or slot capacity", () => {
    expect(routeLocalWalkingDelivery(routingInput([
      location("store-3rd-avenue", 0.4, 1_000, {
        zones: [zone("store-86th-street", 1_000)]
      })
    ]))).toMatchObject({ reasonCode: "INVALID_ROUTING_CONFIGURATION" });

    expect(routeLocalWalkingDelivery(routingInput([
      location("store-3rd-avenue", 0.4, 1_000, {
        slots: [slot({
          capacity: { maxCapacityPoints: 5, confirmedCapacityPoints: 5, heldCapacityPoints: 1 }
        })]
      })
    ]))).toMatchObject({ reasonCode: "INVALID_ROUTING_CONFIGURATION" });
  });
});
