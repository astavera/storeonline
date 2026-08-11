/**
 * Implements the local delivery routing service workflow for the fulfillment feature.
 */

import {
  evaluateLocalDelivery,
  type DeliveryZonePolicy,
  type LngLat,
  type LocalDeliveryReasonCode
} from "@/features/fulfillment/services/delivery-zone-service";
import {
  evaluateSlotAvailability,
  type SlotAvailabilityInput,
  type SlotCapacityState
} from "@/features/fulfillment/services/slot-capacity-service";

export type WalkingDeliverySlotPolicy = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  cutoffMinutes: number;
  leadTimeMinutes: number;
  capacity: SlotCapacityState;
};

export type WalkingDeliveryLocationPolicy = {
  id: string;
  name: string;
  localDeliveryEnabled: boolean;
  walkingDistanceMiles: number;
  walkingDurationMinutes: number;
  zones: readonly DeliveryZonePolicy[];
  slots: readonly WalkingDeliverySlotPolicy[];
};

export type RouteLocalDeliveryInput = {
  now: Date;
  serviceDay: string;
  point: LngLat;
  subtotalCents: number;
  requestedCapacityPoints: number;
  locations: readonly WalkingDeliveryLocationPolicy[];
};

export type RoutedDeliverySlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  remainingCapacityPoints: number;
  bookingCutoffAt?: Date;
};

export type LocationDeliveryEvaluation = {
  locationId: string;
  reasonCode: LocalDeliveryReasonCode;
};

export const localDeliveryRoutingReasonCodes = [
  "READY",
  "INVALID_INPUT",
  "INVALID_ROUTING_CONFIGURATION",
  "OUTSIDE_WALKING_AREA",
  "NO_ELIGIBLE_LOCATION",
  "NO_AVAILABLE_SLOTS"
] as const;

export type LocalDeliveryRoutingReasonCode = (typeof localDeliveryRoutingReasonCodes)[number];

type LocalDeliveryRoutingFailure = {
  routeFound: false;
  bookable: false;
  reasonCode: Exclude<LocalDeliveryRoutingReasonCode, "READY" | "NO_AVAILABLE_SLOTS">;
  locationEvaluations: readonly LocationDeliveryEvaluation[];
};

type LocalDeliveryRoutingSelection = {
  routeFound: true;
  bookable: boolean;
  reasonCode: "READY" | "NO_AVAILABLE_SLOTS";
  locationId: string;
  locationName: string;
  zoneId: string;
  zoneVersionId?: string;
  feeCents: number;
  walkingDistanceMiles: number;
  walkingDurationMinutes: number;
  availableSlots: readonly RoutedDeliverySlot[];
  locationEvaluations: readonly LocationDeliveryEvaluation[];
};

export type LocalDeliveryRoutingResult = LocalDeliveryRoutingFailure | LocalDeliveryRoutingSelection;

type EligibleLocationCandidate = {
  location: WalkingDeliveryLocationPolicy;
  deliveryEvaluation: {
    feeCents: number;
    zoneId: string;
    zoneVersionId?: string;
  };
};

export function routeLocalWalkingDelivery(input: RouteLocalDeliveryInput): LocalDeliveryRoutingResult {
  if (!isValidRoutingInput(input)) {
    return failure("INVALID_INPUT");
  }

  const activeLocations = input.locations.filter((location) => location.localDeliveryEnabled);
  if (activeLocations.length === 0 || activeLocations.some((location) => !isValidLocationPolicy(location))) {
    return failure("INVALID_ROUTING_CONFIGURATION");
  }

  const locationEvaluations: LocationDeliveryEvaluation[] = [];
  const eligibleLocations: EligibleLocationCandidate[] = [];
  let invalidConfiguration = false;

  for (const location of activeLocations) {
    const deliveryEvaluation = evaluateLocalDelivery({
      locationId: location.id,
      serviceDay: input.serviceDay,
      point: input.point,
      subtotalCents: input.subtotalCents,
      distanceMiles: location.walkingDistanceMiles,
      routeMinutes: location.walkingDurationMinutes
    }, location.zones);

    locationEvaluations.push({
      locationId: location.id,
      reasonCode: deliveryEvaluation.reasonCode
    });

    if (deliveryEvaluation.reasonCode === "INVALID_INPUT"
      || deliveryEvaluation.reasonCode === "INVALID_ZONE_CONFIGURATION") {
      invalidConfiguration = true;
      continue;
    }

    if (!deliveryEvaluation.eligible
      || deliveryEvaluation.feeCents == null
      || deliveryEvaluation.zoneId == null) {
      continue;
    }

    eligibleLocations.push({
      location,
      deliveryEvaluation: {
        feeCents: deliveryEvaluation.feeCents,
        zoneId: deliveryEvaluation.zoneId,
        zoneVersionId: deliveryEvaluation.zoneVersionId
      }
    });
  }

  if (invalidConfiguration) {
    return failure("INVALID_ROUTING_CONFIGURATION", locationEvaluations);
  }

  const candidates = eligibleLocations.sort(compareNearestLocation);

  if (candidates.length === 0) {
    const outsideWalkingArea = locationEvaluations.every((evaluation) =>
      evaluation.reasonCode === "OUTSIDE_ZONE" || evaluation.reasonCode === "NO_ACTIVE_ZONE");
    return failure(outsideWalkingArea ? "OUTSIDE_WALKING_AREA" : "NO_ELIGIBLE_LOCATION", locationEvaluations);
  }

  const selected = candidates[0];
  const slotResults = selected.location.slots.map((slot) => ({
    slot,
    evaluation: evaluateSlotAvailability(toSlotAvailabilityInput(slot, input))
  }));

  if (slotResults.some(({ evaluation }) => evaluation.reasonCode === "INVALID_INPUT")) {
    return failure("INVALID_ROUTING_CONFIGURATION", locationEvaluations);
  }

  const availableSlots = slotResults
    .filter(({ evaluation }) => evaluation.available)
    .map(({ slot, evaluation }) => ({
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      remainingCapacityPoints: evaluation.remainingCapacityPoints,
      bookingCutoffAt: evaluation.bookingCutoffAt
    }))
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.id.localeCompare(right.id));

  return {
    routeFound: true,
    bookable: availableSlots.length > 0,
    reasonCode: availableSlots.length > 0 ? "READY" : "NO_AVAILABLE_SLOTS",
    locationId: selected.location.id,
    locationName: selected.location.name,
    zoneId: selected.deliveryEvaluation.zoneId,
    zoneVersionId: selected.deliveryEvaluation.zoneVersionId,
    feeCents: selected.deliveryEvaluation.feeCents,
    walkingDistanceMiles: selected.location.walkingDistanceMiles,
    walkingDurationMinutes: selected.location.walkingDurationMinutes,
    availableSlots,
    locationEvaluations
  };
}

function toSlotAvailabilityInput(
  slot: WalkingDeliverySlotPolicy,
  input: RouteLocalDeliveryInput
): SlotAvailabilityInput {
  return {
    now: input.now,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    active: slot.active,
    cutoffMinutes: slot.cutoffMinutes,
    leadTimeMinutes: slot.leadTimeMinutes,
    capacity: slot.capacity,
    requestedCapacityPoints: input.requestedCapacityPoints
  };
}

function isValidRoutingInput(input: RouteLocalDeliveryInput) {
  return isValidDate(input.now)
    && input.serviceDay.length > 0
    && isLngLat(input.point)
    && isNonnegativeInteger(input.subtotalCents)
    && isPositiveInteger(input.requestedCapacityPoints)
    && Array.isArray(input.locations);
}

function isValidLocationPolicy(location: WalkingDeliveryLocationPolicy) {
  return location.id.length > 0
    && location.name.length > 0
    && isNonnegativeNumber(location.walkingDistanceMiles)
    && isNonnegativeNumber(location.walkingDurationMinutes)
    && Array.isArray(location.zones)
    && location.zones.length > 0
    && location.zones.every((zone) => zone.locationId === location.id)
    && Array.isArray(location.slots)
    && location.slots.every((slot) => slot.id.length > 0);
}

function compareNearestLocation(
  left: { location: WalkingDeliveryLocationPolicy },
  right: { location: WalkingDeliveryLocationPolicy }
) {
  return left.location.walkingDistanceMiles - right.location.walkingDistanceMiles
    || left.location.walkingDurationMinutes - right.location.walkingDurationMinutes
    || left.location.id.localeCompare(right.location.id);
}

function failure(
  reasonCode: LocalDeliveryRoutingFailure["reasonCode"],
  locationEvaluations: readonly LocationDeliveryEvaluation[] = []
): LocalDeliveryRoutingFailure {
  return { routeFound: false, bookable: false, reasonCode, locationEvaluations };
}

function isLngLat(value: unknown): value is LngLat {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function isValidDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isNonnegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function isNonnegativeNumber(value: number) {
  return Number.isFinite(value) && value >= 0;
}
