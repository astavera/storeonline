/**
 * Implements server-side local delivery canary orchestrator behavior and persistence boundaries.
 */

import "server-only";

import type {
  OrderProCreateHoldRequest,
  OrderProCreateHoldResult,
  OrderProGetHoldResult,
  OrderProHold,
  OrderProHoldTransitionResult,
  OrderProQuoteRequest,
  OrderProQuoteResult
} from "@/server/orderpro/contracts";

export type OrderProCanaryAddress = Readonly<{
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}>;

export const ORDERPRO_LOCAL_DELIVERY_CANARY_EXECUTION_FLAG =
  "RUN_STAGING_B_CANCEL_THEN_A_SUCCESS_WITHOUT_SQUARE" as const;
export const ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID = "third_avenue" as const;
export const ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS = {
  A: "OIXCBCNMHZVFXTHIZ4RI6PIO",
  B: "NSRYCOYYAWR6G5LRWH5AKPP5"
} as const;

export type OrderProCanaryMutationContext = Readonly<{
  correlationId: string;
  idempotencyKey: string;
}>;

export type OrderProCanaryReadContext = Readonly<{
  correlationId: string;
}>;

/**
 * Structural boundary for the V4 client. Keeping this port local lets the
 * canary remain independent from checkout, Square, Prisma, and UI code.
 */
export type OrderProLocalDeliveryCanaryClient = Readonly<{
  quote(
    request: OrderProQuoteRequest,
    context: OrderProCanaryMutationContext
  ): Promise<OrderProQuoteResult>;
  createHold(
    request: OrderProCreateHoldRequest,
    context: OrderProCanaryMutationContext
  ): Promise<OrderProCreateHoldResult>;
  getHold(
    capacityHoldId: string,
    context: OrderProCanaryReadContext
  ): Promise<OrderProGetHoldResult>;
  releaseHold(
    capacityHoldId: string,
    request: Readonly<{ reason: "ORDER_CANCELLED"; correlationId: string }>
  ): Promise<OrderProHoldTransitionResult>;
  confirmHold(
    capacityHoldId: string,
    request: Readonly<{ orderId: string; correlationId: string }>
  ): Promise<OrderProHoldTransitionResult>;
}>;

export type OrderProLocalDeliveryCanaryInput = Readonly<{
  client: OrderProLocalDeliveryCanaryClient;
  runId: string;
  integrationEnvironment: string | undefined;
  executionFlag: string | undefined;
  variationAId: string | undefined;
  variationBId: string | undefined;
  allowedSlotIds: readonly string[];
  address: OrderProCanaryAddress;
  requestedDate: string;
}>;

export type OrderProLocalDeliveryCanaryResult = Readonly<{
  status: "PASSED";
  runId: string;
  locationId: typeof ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID;
  sequence: readonly ["B_CANCEL", "A_SUCCESS"];
  cancelled: Readonly<{
    variationId: typeof ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B;
    quoteId: string;
    capacityHoldId: string;
    slotId: string;
    inventoryReservationId: string;
    status: "RELEASED";
  }>;
  confirmed: Readonly<{
    variationId: typeof ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A;
    quoteId: string;
    capacityHoldId: string;
    slotId: string;
    inventoryReservationId: string;
    orderId: string;
    status: "CONFIRMED";
  }>;
}>;

export type OrderProLocalDeliveryCanaryErrorCode =
  | "SAFETY_GATES_NOT_READY"
  | "INVALID_RUN_ID"
  | "INVALID_REQUESTED_DATE"
  | "QUOTE_NOT_CANARY_SAFE"
  | "HOLD_NOT_CANARY_SAFE"
  | "HOLD_CREATION_AMBIGUOUS"
  | "TRANSITION_FAILED"
  | "TRANSITION_AMBIGUOUS"
  | "FINAL_STATE_NOT_VERIFIED";

export class OrderProLocalDeliveryCanaryError extends Error {
  constructor(
    readonly code: OrderProLocalDeliveryCanaryErrorCode,
    options?: ErrorOptions
  ) {
    super(`ORDERPRO_LOCAL_DELIVERY_CANARY:${code}`, options);
    this.name = "OrderProLocalDeliveryCanaryError";
  }
}

type Scenario = "B_CANCEL" | "A_SUCCESS";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function fail(
  code: OrderProLocalDeliveryCanaryErrorCode,
  cause?: unknown
): never {
  throw new OrderProLocalDeliveryCanaryError(code, cause === undefined ? undefined : { cause });
}

function operationKey(runId: string, scenario: Scenario, operation: string) {
  return `orderpro-canary:${runId}:${scenario.toLowerCase()}:${operation}`;
}

function mutationContext(
  runId: string,
  scenario: Scenario,
  operation: string
): OrderProCanaryMutationContext {
  const key = operationKey(runId, scenario, operation);
  return { correlationId: key, idempotencyKey: key };
}

function readContext(
  runId: string,
  scenario: Scenario,
  operation: string
): OrderProCanaryReadContext {
  return { correlationId: operationKey(runId, scenario, operation) };
}

function assertSafetyGates(input: OrderProLocalDeliveryCanaryInput) {
  const allowedSlots = new Set(input.allowedSlotIds);
  const exactVariations =
    input.variationAId === ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A &&
    input.variationBId === ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B;

  if (
    input.integrationEnvironment !== "STAGING" ||
    input.executionFlag !== ORDERPRO_LOCAL_DELIVERY_CANARY_EXECUTION_FLAG ||
    !exactVariations ||
    allowedSlots.size === 0 ||
    allowedSlots.size !== input.allowedSlotIds.length ||
    input.allowedSlotIds.some((slotId) => slotId.trim() !== slotId || slotId.length < 1)
  ) {
    fail("SAFETY_GATES_NOT_READY");
  }
}

function assertHoldIdentity(
  hold: OrderProHold,
  expected: Readonly<{
    capacityHoldId?: string;
    quoteId: string;
    slotId: string;
  }>
) {
  if (
    (expected.capacityHoldId !== undefined && hold.capacityHoldId !== expected.capacityHoldId) ||
    hold.quoteId !== expected.quoteId ||
    hold.slotId !== expected.slotId ||
    hold.locationId !== ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID
  ) {
    fail("HOLD_NOT_CANARY_SAFE");
  }
}

async function recoverCanaryReservation(
  input: OrderProLocalDeliveryCanaryInput,
  scenario: Scenario,
  variationId:
    | typeof ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A
    | typeof ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B
) {
  const quote = await input.client.quote(
    {
      address: input.address,
      cartLines: [{ variantId: variationId, quantity: 1 }],
      requestedDate: input.requestedDate
    },
    mutationContext(input.runId, scenario, "quote")
  );

  if (
    !quote.eligible ||
    !quote.bookable ||
    quote.selectedLocationId !== ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID ||
    quote.inventoryStatus !== "READY" ||
    quote.inventoryOwnerLocationIds.length !== 1 ||
    quote.inventoryOwnerLocationIds[0] !== ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID ||
    quote.inventoryNodeIds.length !== 1 ||
    quote.inventoryNodeIds[0] !== ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID
  ) {
    fail("QUOTE_NOT_CANARY_SAFE");
  }

  const allowedSlots = new Set(input.allowedSlotIds);
  const slot = quote.availableSlots.find(
    (candidate) =>
      candidate.locationId === ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID &&
      allowedSlots.has(candidate.slotId)
  );
  if (!slot) {
    fail("QUOTE_NOT_CANARY_SAFE");
  }

  const request = { quoteId: quote.quoteId, slotId: slot.slotId } as const;
  const context = mutationContext(input.runId, scenario, "create-hold");
  let created: OrderProCreateHoldResult;
  try {
    created = await input.client.createHold(request, context);
  } catch (firstError) {
    // The hold id is unavailable when a response is lost. A single replay with
    // the same idempotency key is the only safe way to recover it.
    try {
      created = await input.client.createHold(request, context);
    } catch (secondError) {
      fail("HOLD_CREATION_AMBIGUOUS", new AggregateError([firstError, secondError]));
    }
  }

  assertHoldIdentity(created.hold, {
    quoteId: quote.quoteId,
    slotId: slot.slotId
  });

  return { quoteId: quote.quoteId, slotId: slot.slotId, hold: created.hold };
}

async function reconcileTransition(
  input: OrderProLocalDeliveryCanaryInput,
  scenario: Scenario,
  operation: "release" | "confirm",
  expected: Readonly<{
    hold: OrderProHold;
    status: "RELEASED" | "CONFIRMED";
    releaseReason?: "ORDER_CANCELLED";
    orderId?: string;
  }>,
  transition: () => Promise<OrderProHoldTransitionResult>
) {
  try {
    const result = await transition();
    assertHoldIdentity(result.hold, {
      capacityHoldId: expected.hold.capacityHoldId,
      quoteId: expected.hold.quoteId,
      slotId: expected.hold.slotId
    });
    if (
      result.hold.status !== expected.status ||
      (expected.releaseReason !== undefined && result.hold.releaseReason !== expected.releaseReason) ||
      (expected.orderId !== undefined && result.hold.confirmedOrderId !== expected.orderId)
    ) {
      throw new OrderProLocalDeliveryCanaryError("TRANSITION_FAILED");
    }
    return result.hold;
  } catch (transitionError) {
    let recovered: OrderProHold;
    try {
      recovered = (
        await input.client.getHold(
          expected.hold.capacityHoldId,
          readContext(input.runId, scenario, `reconcile-${operation}`)
        )
      ).hold;
      assertHoldIdentity(recovered, {
        capacityHoldId: expected.hold.capacityHoldId,
        quoteId: expected.hold.quoteId,
        slotId: expected.hold.slotId
      });
    } catch (recoveryError) {
      fail("TRANSITION_AMBIGUOUS", new AggregateError([transitionError, recoveryError]));
    }

    if (
      recovered.status === expected.status &&
      (expected.releaseReason === undefined || recovered.releaseReason === expected.releaseReason) &&
      (expected.orderId === undefined || recovered.confirmedOrderId === expected.orderId)
    ) {
      return recovered;
    }
    if (recovered.status === "HELD") {
      fail("TRANSITION_FAILED", transitionError);
    }
    fail("TRANSITION_AMBIGUOUS", transitionError);
  }
}

async function verifyFinalState(
  input: OrderProLocalDeliveryCanaryInput,
  scenario: Scenario,
  expected: Readonly<{
    hold: OrderProHold;
    status: "RELEASED" | "CONFIRMED";
    releaseReason?: "ORDER_CANCELLED";
    orderId?: string;
  }>
) {
  const final = (
    await input.client.getHold(
      expected.hold.capacityHoldId,
      readContext(input.runId, scenario, "verify-final")
    )
  ).hold;
  assertHoldIdentity(final, {
    capacityHoldId: expected.hold.capacityHoldId,
    quoteId: expected.hold.quoteId,
    slotId: expected.hold.slotId
  });
  if (
    final.status !== expected.status ||
    (expected.releaseReason !== undefined && final.releaseReason !== expected.releaseReason) ||
    (expected.orderId !== undefined && final.confirmedOrderId !== expected.orderId)
  ) {
    fail("FINAL_STATE_NOT_VERIFIED");
  }
  return final;
}

export async function runPrivateOrderProLocalDeliveryCanary(
  input: OrderProLocalDeliveryCanaryInput
): Promise<OrderProLocalDeliveryCanaryResult> {
  assertSafetyGates(input);
  if (!uuidPattern.test(input.runId)) {
    fail("INVALID_RUN_ID");
  }
  if (!isoDatePattern.test(input.requestedDate)) {
    fail("INVALID_REQUESTED_DATE");
  }

  // B must complete and be observed as RELEASED before A is allowed to start.
  const cancelledReservation = await recoverCanaryReservation(
    input,
    "B_CANCEL",
    ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B
  );
  const released = cancelledReservation.hold.status === "HELD"
    ? await reconcileTransition(
        input,
        "B_CANCEL",
        "release",
        {
          hold: cancelledReservation.hold,
          status: "RELEASED",
          releaseReason: "ORDER_CANCELLED"
        },
        () =>
          input.client.releaseHold(
            cancelledReservation.hold.capacityHoldId,
            {
              reason: "ORDER_CANCELLED",
              correlationId: operationKey(input.runId, "B_CANCEL", "release")
            }
          )
      )
    : cancelledReservation.hold.status === "RELEASED" &&
        cancelledReservation.hold.releaseReason === "ORDER_CANCELLED"
      ? cancelledReservation.hold
      : fail("TRANSITION_AMBIGUOUS");
  const verifiedReleased = await verifyFinalState(input, "B_CANCEL", {
    hold: released,
    status: "RELEASED",
    releaseReason: "ORDER_CANCELLED"
  });

  const confirmedReservation = await recoverCanaryReservation(
    input,
    "A_SUCCESS",
    ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A
  );
  const orderId = `orderpro-canary:${input.runId}:a-success`;
  const confirmed = confirmedReservation.hold.status === "HELD"
    ? await reconcileTransition(
        input,
        "A_SUCCESS",
        "confirm",
        { hold: confirmedReservation.hold, status: "CONFIRMED", orderId },
        () =>
          input.client.confirmHold(
            confirmedReservation.hold.capacityHoldId,
            {
              orderId,
              correlationId: operationKey(input.runId, "A_SUCCESS", "confirm")
            }
          )
      )
    : confirmedReservation.hold.status === "CONFIRMED" &&
        confirmedReservation.hold.confirmedOrderId === orderId
      ? confirmedReservation.hold
      : fail("TRANSITION_AMBIGUOUS");
  const verifiedConfirmed = await verifyFinalState(input, "A_SUCCESS", {
    hold: confirmed,
    status: "CONFIRMED",
    orderId
  });

  return {
    status: "PASSED",
    runId: input.runId,
    locationId: ORDERPRO_LOCAL_DELIVERY_CANARY_LOCATION_ID,
    sequence: ["B_CANCEL", "A_SUCCESS"],
    cancelled: {
      variationId: ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B,
      quoteId: cancelledReservation.quoteId,
      capacityHoldId: verifiedReleased.capacityHoldId,
      slotId: cancelledReservation.slotId,
      inventoryReservationId: verifiedReleased.inventoryReservationId,
      status: "RELEASED"
    },
    confirmed: {
      variationId: ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A,
      quoteId: confirmedReservation.quoteId,
      capacityHoldId: verifiedConfirmed.capacityHoldId,
      slotId: confirmedReservation.slotId,
      inventoryReservationId: verifiedConfirmed.inventoryReservationId,
      orderId,
      status: "CONFIRMED"
    }
  };
}
