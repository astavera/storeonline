// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type {
  OrderProHold,
  OrderProQuoteRequest,
  OrderProQuoteResult
} from "@/server/orderpro/contracts";
import {
  ORDERPRO_LOCAL_DELIVERY_CANARY_EXECUTION_FLAG,
  ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS,
  runPrivateOrderProLocalDeliveryCanary,
  type OrderProLocalDeliveryCanaryClient,
  type OrderProLocalDeliveryCanaryInput
} from "@/server/orderpro/local-delivery-canary-orchestrator";

const runId = "00000000-0000-4000-8000-000000000123";
const allowedSlotId = "delivery-third_avenue-2026-07-23-1000";
const timestamp = "2026-07-22T18:00:00.000Z";

type RecordedCall = Readonly<{
  method: string;
  payload?: unknown;
  context: Readonly<{ correlationId: string; idempotencyKey?: string }>;
}>;

function quoteFor(
  request: OrderProQuoteRequest,
  slotId = allowedSlotId,
  topology: Readonly<{
    inventoryOwnerLocationIds?: string[];
    inventoryNodeIds?: string[];
  }> = {}
): OrderProQuoteResult {
  const suffix = request.cartLines[0]?.variantId === ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B ? "b" : "a";
  return {
    quoteId: `quote-${suffix}`,
    replayed: false,
    eligible: true,
    bookable: true,
    reasonCode: "ELIGIBLE",
    normalizedAddress: { ...request.address, borough: "Manhattan" },
    coordinates: { latitude: 40.769, longitude: -73.96 },
    postalCode: "10021",
    selectedLocationId: "third_avenue",
    selectedLocationName: "3rd Avenue Store",
    assignmentRule: "FIXED_POSTAL_ZONE",
    walkingDistanceFeet: 100,
    walkingDurationSeconds: 60,
    roundTripDistanceFeet: 200,
    estimatedRoundTripDurationSeconds: 120,
    requiredCapacitySeconds: 300,
    feeCents: 0,
    currency: "USD",
    feeTierId: "canary-fee",
    candidateRoutes: [
      {
        locationId: "third_avenue",
        locationPriority: 1,
        walkingDistanceFeet: 100,
        walkingDurationSeconds: 60,
        routingProvider: "canary-router"
      }
    ],
    availableSlots: [
      {
        slotId,
        locationId: "third_avenue",
        startsAt: "2026-07-23T14:00:00.000Z",
        endsAt: "2026-07-23T15:00:00.000Z",
        remainingCapacitySeconds: 1_000
      }
    ],
    inventoryStatus: "READY",
    transferEarliestReadyAt: null,
    inventoryOwnerLocationIds: topology.inventoryOwnerLocationIds ?? ["third_avenue"],
    inventoryNodeIds: topology.inventoryNodeIds ?? ["third_avenue"],
    zoneVersionId: "zone-v1",
    feePolicyVersionId: "fee-v1",
    routingProvider: "canary-router",
    routingProfile: "walking",
    routeCalculatedAt: timestamp,
    expiresAt: "2026-07-22T18:15:00.000Z",
    correlationId: `quote-${suffix}-correlation`
  };
}

function held(quoteId: string, slotId: string): OrderProHold {
  const suffix = quoteId.endsWith("b") ? "b" : "a";
  return {
    capacityHoldId: `hold-${suffix}`,
    quoteId,
    slotId,
    locationId: "third_avenue",
    clientId: "storefront-staging",
    correlationId: `hold-${suffix}-correlation`,
    inventoryReservationId: `reservation-${suffix}`,
    capacitySeconds: 300,
    status: "HELD",
    createdAt: timestamp,
    expiresAt: "2026-07-22T18:15:00.000Z",
    confirmedOrderId: null,
    confirmedAt: null,
    releasedAt: null,
    releaseReason: null
  };
}

function createHarness(options: {
  slotId?: string;
  inventoryOwnerLocationIds?: string[];
  inventoryNodeIds?: string[];
  replayedBState?: "RELEASED" | "CONFIRMED";
  replayedAState?: "RELEASED" | "CONFIRMED";
  releaseThrowsAfterApply?: boolean;
  confirmThrowsAfterApply?: boolean;
  ambiguousRelease?: boolean;
} = {}) {
  const calls: RecordedCall[] = [];
  const holds = new Map<string, OrderProHold>();

  const client: OrderProLocalDeliveryCanaryClient = {
    quote: vi.fn(async (request, context) => {
      calls.push({ method: "quote", payload: request, context });
      return quoteFor(request, options.slotId, {
        inventoryOwnerLocationIds: options.inventoryOwnerLocationIds,
        inventoryNodeIds: options.inventoryNodeIds
      });
    }),
    createHold: vi.fn(async (request, context) => {
      calls.push({ method: "createHold", payload: request, context });
      const initial = held(request.quoteId, request.slotId);
      const suffix = request.quoteId.endsWith("b") ? "B" : "A";
      const replayedState = suffix === "B" ? options.replayedBState : options.replayedAState;
      const value: OrderProHold = replayedState === "RELEASED"
        ? {
            ...initial,
            status: "RELEASED",
            releasedAt: timestamp,
            releaseReason: "ORDER_CANCELLED"
          }
        : replayedState === "CONFIRMED"
          ? {
              ...initial,
              status: "CONFIRMED",
              confirmedAt: timestamp,
              confirmedOrderId: `orderpro-canary:${runId}:a-success`
            }
          : initial;
      holds.set(value.capacityHoldId, value);
      return { hold: value, replayed: replayedState !== undefined };
    }),
    getHold: vi.fn(async (capacityHoldId, context) => {
      calls.push({ method: "getHold", payload: capacityHoldId, context });
      const value = holds.get(capacityHoldId);
      if (!value) throw new Error("missing hold");
      return { hold: value };
    }),
    releaseHold: vi.fn(async (capacityHoldId, { correlationId, ...request }) => {
      calls.push({ method: "releaseHold", payload: request, context: { correlationId } });
      const value = holds.get(capacityHoldId);
      if (!value) throw new Error("missing hold");
      const released: OrderProHold = options.ambiguousRelease
        ? {
            ...value,
            status: "CONFIRMED",
            confirmedOrderId: "unexpected-order",
            confirmedAt: timestamp
          }
        : {
            ...value,
            status: "RELEASED",
            releasedAt: timestamp,
            releaseReason: request.reason
          };
      holds.set(capacityHoldId, released);
      if (options.releaseThrowsAfterApply || options.ambiguousRelease) {
        throw new Error("response lost");
      }
      return { hold: released, changed: true };
    }),
    confirmHold: vi.fn(async (capacityHoldId, { correlationId, ...request }) => {
      calls.push({ method: "confirmHold", payload: request, context: { correlationId } });
      const value = holds.get(capacityHoldId);
      if (!value) throw new Error("missing hold");
      const confirmed: OrderProHold = {
        ...value,
        status: "CONFIRMED",
        confirmedOrderId: request.orderId,
        confirmedAt: timestamp
      };
      holds.set(capacityHoldId, confirmed);
      if (options.confirmThrowsAfterApply) throw new Error("response lost");
      return { hold: confirmed, changed: true };
    })
  };

  return { client, calls };
}

function canaryInput(
  client: OrderProLocalDeliveryCanaryClient,
  overrides: Partial<OrderProLocalDeliveryCanaryInput> = {}
): OrderProLocalDeliveryCanaryInput {
  return {
    client,
    runId,
    integrationEnvironment: "STAGING",
    executionFlag: ORDERPRO_LOCAL_DELIVERY_CANARY_EXECUTION_FLAG,
    variationAId: ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A,
    variationBId: ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B,
    allowedSlotIds: [allowedSlotId],
    address: {
      line1: "1243 3rd Ave",
      line2: null,
      city: "New York",
      state: "NY",
      postalCode: "10021",
      country: "US"
    },
    requestedDate: "2026-07-23",
    ...overrides
  };
}

describe("private OrderPRO local-delivery canary orchestrator", () => {
  it("runs B_CANCEL completely before A_SUCCESS with deterministic identities", async () => {
    const { client, calls } = createHarness();

    const result = await runPrivateOrderProLocalDeliveryCanary(canaryInput(client));

    expect(result).toMatchObject({
      status: "PASSED",
      locationId: "third_avenue",
      sequence: ["B_CANCEL", "A_SUCCESS"],
      cancelled: {
        variationId: ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B,
        inventoryReservationId: "reservation-b",
        status: "RELEASED"
      },
      confirmed: {
        variationId: ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A,
        inventoryReservationId: "reservation-a",
        status: "CONFIRMED",
        orderId: `orderpro-canary:${runId}:a-success`
      }
    });
    expect(calls.map(({ method }) => method)).toEqual([
      "quote",
      "createHold",
      "releaseHold",
      "getHold",
      "quote",
      "createHold",
      "confirmHold",
      "getHold"
    ]);
    expect(calls[0]?.payload).toMatchObject({
      cartLines: [{ variantId: ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.B, quantity: 1 }]
    });
    expect(calls[4]?.payload).toMatchObject({
      cartLines: [{ variantId: ORDERPRO_LOCAL_DELIVERY_CANARY_VARIATIONS.A, quantity: 1 }]
    });
    expect(calls[0]?.context).toEqual({
      correlationId: `orderpro-canary:${runId}:b_cancel:quote`,
      idempotencyKey: `orderpro-canary:${runId}:b_cancel:quote`
    });
    expect(calls[6]?.payload).toEqual({
      orderId: `orderpro-canary:${runId}:a-success`
    });
  });

  it("reconciles lost transition responses with GET before proceeding", async () => {
    const { client, calls } = createHarness({
      releaseThrowsAfterApply: true,
      confirmThrowsAfterApply: true
    });

    await expect(
      runPrivateOrderProLocalDeliveryCanary(canaryInput(client))
    ).resolves.toMatchObject({
      cancelled: { status: "RELEASED" },
      confirmed: { status: "CONFIRMED" }
    });
    expect(calls.map(({ method }) => method)).toEqual([
      "quote",
      "createHold",
      "releaseHold",
      "getHold",
      "getHold",
      "quote",
      "createHold",
      "confirmHold",
      "getHold",
      "getHold"
    ]);
    expect(calls[3]?.context.correlationId).toContain("reconcile-release");
    expect(calls[8]?.context.correlationId).toContain("reconcile-confirm");
  });

  it.each([
    ["production environment", { integrationEnvironment: "PRODUCTION" }],
    ["near-match flag", { executionFlag: "true" }],
    ["unapproved A", { variationAId: "some-other-variation" }],
    ["unapproved B", { variationBId: "some-other-variation" }],
    ["no approved slots", { allowedSlotIds: [] }],
    ["duplicate approved slots", { allowedSlotIds: [allowedSlotId, allowedSlotId] }]
  ])("fails closed for %s", async (_label, overrides) => {
    const { client } = createHarness();

    await expect(
      runPrivateOrderProLocalDeliveryCanary(canaryInput(client, overrides))
    ).rejects.toMatchObject({ code: "SAFETY_GATES_NOT_READY" });
    expect(client.quote).not.toHaveBeenCalled();
  });

  it("rejects a quoted slot that is outside the explicit canary allowlist", async () => {
    const { client } = createHarness({ slotId: "delivery-third_avenue-not-approved" });

    await expect(
      runPrivateOrderProLocalDeliveryCanary(canaryInput(client))
    ).rejects.toMatchObject({ code: "QUOTE_NOT_CANARY_SAFE" });
    expect(client.createHold).not.toHaveBeenCalled();
  });

  it.each([
    ["inventory owner", { inventoryOwnerLocationIds: ["east_86th_street"] }],
    ["inventory node", { inventoryNodeIds: ["east_86th_street"] }],
    ["multiple owners", { inventoryOwnerLocationIds: ["third_avenue", "east_86th_street"] }]
  ])("rejects drift in the %s topology", async (_label, options) => {
    const { client } = createHarness(options);

    await expect(
      runPrivateOrderProLocalDeliveryCanary(canaryInput(client))
    ).rejects.toMatchObject({ code: "QUOTE_NOT_CANARY_SAFE" });
    expect(client.createHold).not.toHaveBeenCalled();
  });

  it("resumes the same run after B was released and A was confirmed before a process restart", async () => {
    const { client, calls } = createHarness({
      replayedBState: "RELEASED",
      replayedAState: "CONFIRMED"
    });

    await expect(
      runPrivateOrderProLocalDeliveryCanary(canaryInput(client))
    ).resolves.toMatchObject({
      status: "PASSED",
      cancelled: { status: "RELEASED" },
      confirmed: {
        status: "CONFIRMED",
        orderId: `orderpro-canary:${runId}:a-success`
      }
    });
    expect(client.releaseHold).not.toHaveBeenCalled();
    expect(client.confirmHold).not.toHaveBeenCalled();
    expect(calls.map(({ method }) => method)).toEqual([
      "quote",
      "createHold",
      "getHold",
      "quote",
      "createHold",
      "getHold"
    ]);
  });

  it("stops before A when a failed release reconciles to an ambiguous terminal state", async () => {
    const { client } = createHarness({ ambiguousRelease: true });

    await expect(
      runPrivateOrderProLocalDeliveryCanary(canaryInput(client))
    ).rejects.toMatchObject({ code: "TRANSITION_AMBIGUOUS" });
    expect(client.quote).toHaveBeenCalledTimes(1);
    expect(client.confirmHold).not.toHaveBeenCalled();
  });
});
