/**
 * Implements the slot capacity service workflow for the fulfillment feature.
 */

export type SlotCapacityState = {
  maxCapacityPoints: number;
  confirmedCapacityPoints: number;
  heldCapacityPoints: number;
};

export type SlotAvailabilityInput = {
  now: Date;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  cutoffMinutes: number;
  leadTimeMinutes: number;
  capacity: SlotCapacityState;
  requestedCapacityPoints: number;
};

export const slotAvailabilityReasonCodes = [
  "AVAILABLE",
  "INVALID_INPUT",
  "INACTIVE",
  "ALREADY_STARTED",
  "LEAD_TIME_NOT_MET",
  "CUTOFF_PASSED",
  "CAPACITY_EXCEEDED"
] as const;

export type SlotAvailabilityReasonCode = (typeof slotAvailabilityReasonCodes)[number];

export type SlotAvailabilityEvaluation = {
  available: boolean;
  reasonCode: SlotAvailabilityReasonCode;
  remainingCapacityPoints: number;
  bookingCutoffAt?: Date;
  earliestAllowedStartAt?: Date;
};

const capacityPointValues = {
  "simple-mylar-pickup": 1,
  "latex-bouquet-pickup": 3,
  "large-arrangement": 8,
  "local-delivery-stop": 2,
  "same-day-rush": 2
} as const;

export type CapacityPointKind = keyof typeof capacityPointValues;

export function canReserveCapacity(state: SlotCapacityState, requestedCapacityPoints: number) {
  if (!isValidCapacityState(state) || !isPositiveInteger(requestedCapacityPoints)) return false;
  return usedCapacityPoints(state) + requestedCapacityPoints <= state.maxCapacityPoints;
}

export function remainingCapacityPoints(state: SlotCapacityState) {
  if (!isValidCapacityState(state)) return 0;
  return Math.max(0, state.maxCapacityPoints - usedCapacityPoints(state));
}

export function evaluateSlotAvailability(input: SlotAvailabilityInput): SlotAvailabilityEvaluation {
  const remaining = remainingCapacityPoints(input.capacity);
  if (!isValidSlotAvailabilityInput(input)) {
    return { available: false, reasonCode: "INVALID_INPUT", remainingCapacityPoints: remaining };
  }

  if (!input.active) {
    return { available: false, reasonCode: "INACTIVE", remainingCapacityPoints: remaining };
  }

  if (input.now.getTime() >= input.startsAt.getTime()) {
    return { available: false, reasonCode: "ALREADY_STARTED", remainingCapacityPoints: remaining };
  }

  const earliestAllowedStartAt = new Date(input.now.getTime() + input.leadTimeMinutes * 60_000);
  if (input.startsAt.getTime() < earliestAllowedStartAt.getTime()) {
    return {
      available: false,
      reasonCode: "LEAD_TIME_NOT_MET",
      remainingCapacityPoints: remaining,
      earliestAllowedStartAt
    };
  }

  const bookingCutoffAt = new Date(input.startsAt.getTime() - input.cutoffMinutes * 60_000);
  if (input.now.getTime() >= bookingCutoffAt.getTime()) {
    return {
      available: false,
      reasonCode: "CUTOFF_PASSED",
      remainingCapacityPoints: remaining,
      bookingCutoffAt
    };
  }

  if (!canReserveCapacity(input.capacity, input.requestedCapacityPoints)) {
    return {
      available: false,
      reasonCode: "CAPACITY_EXCEEDED",
      remainingCapacityPoints: remaining,
      bookingCutoffAt,
      earliestAllowedStartAt
    };
  }

  return {
    available: true,
    reasonCode: "AVAILABLE",
    remainingCapacityPoints: remaining - input.requestedCapacityPoints,
    bookingCutoffAt,
    earliestAllowedStartAt
  };
}

export function capacityPointsForFulfillment(kind: CapacityPointKind) {
  return capacityPointValues[kind];
}

function isValidSlotAvailabilityInput(input: SlotAvailabilityInput) {
  return isValidDate(input.now)
    && isValidDate(input.startsAt)
    && isValidDate(input.endsAt)
    && input.endsAt.getTime() > input.startsAt.getTime()
    && isNonnegativeInteger(input.cutoffMinutes)
    && isNonnegativeInteger(input.leadTimeMinutes)
    && isValidCapacityState(input.capacity)
    && isPositiveInteger(input.requestedCapacityPoints);
}

function isValidCapacityState(state: SlotCapacityState) {
  return isNonnegativeInteger(state.maxCapacityPoints)
    && isNonnegativeInteger(state.confirmedCapacityPoints)
    && isNonnegativeInteger(state.heldCapacityPoints)
    && usedCapacityPoints(state) <= state.maxCapacityPoints;
}

function usedCapacityPoints(state: SlotCapacityState) {
  return state.confirmedCapacityPoints + state.heldCapacityPoints;
}

function isValidDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function isNonnegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}
