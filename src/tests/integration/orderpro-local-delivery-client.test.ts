// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createOrderProClient,
  OrderProClientError
} from "@/server/orderpro/client";
import type { OrderProApiConfiguration } from "@/server/orderpro/config";
import { ORDERPRO_MAX_RESPONSE_BYTES } from "@/server/orderpro/contracts";

const config: OrderProApiConfiguration = {
  baseUrl: "https://orderpro-staging.vercel.app"
};

const quoteInput = {
  address: {
    line1: "500 E 80th St",
    line2: null,
    city: "New York",
    state: "NY",
    postalCode: "10075",
    country: "US"
  },
  cartLines: [{ variantId: "OIXCBCNMHZVFXTHIZ4RI6PIO", quantity: 1 }],
  requestedDate: "2026-07-23"
};

function quoteResult(correlationId: string) {
  return {
    quoteId: "quote-pilot-a",
    replayed: false,
    eligible: true,
    bookable: true,
    reasonCode: "ELIGIBLE",
    normalizedAddress: { ...quoteInput.address, borough: "Manhattan" },
    coordinates: { latitude: 40.774, longitude: -73.951 },
    postalCode: "10075",
    selectedLocationId: "third_avenue",
    selectedLocationName: "3rd Avenue Store",
    assignmentRule: "NEAREST_WALKING_ROUTE",
    walkingDistanceFeet: 1_250,
    walkingDurationSeconds: 420,
    roundTripDistanceFeet: 2_500,
    estimatedRoundTripDurationSeconds: 840,
    requiredCapacitySeconds: 2_376,
    feeCents: 799,
    currency: "USD",
    feeTierId: "fee-tier-1",
    candidateRoutes: [
      {
        locationId: "third_avenue",
        locationPriority: 1,
        walkingDistanceFeet: 1_250,
        walkingDurationSeconds: 420,
        routingProvider: "mapbox"
      }
    ],
    availableSlots: [
      {
        slotId: "slot-pilot-1",
        locationId: "third_avenue",
        startsAt: "2026-07-23T14:00:00.000Z",
        endsAt: "2026-07-23T16:00:00.000Z",
        remainingCapacitySeconds: 7_200,
        capacityOrders: 3,
        remainingOrders: 2,
        pickupUntilAt: null
      }
    ],
    inventoryStatus: "READY",
    transferEarliestReadyAt: null,
    inventoryOwnerLocationIds: ["third_avenue"],
    inventoryNodeIds: ["third_avenue"],
    zoneVersionId: "manhattan-zone-v4",
    feePolicyVersionId: "walking-fee-v4",
    routingProvider: "mapbox",
    routingProfile: "walking",
    routeCalculatedAt: "2026-07-22T18:00:00.000Z",
    expiresAt: "2026-07-22T18:05:00.000Z",
    correlationId
  };
}

function hold(correlationId: string, overrides: Record<string, unknown> = {}) {
  return {
    capacityHoldId: "hold-pilot-1",
    quoteId: "quote-pilot-a",
    slotId: "slot-pilot-1",
    locationId: "third_avenue",
    clientId: "storefront-staging",
    correlationId,
    inventoryReservationId: "reservation-pilot-1",
    capacitySeconds: 2_376,
    status: "HELD",
    createdAt: "2026-07-22T18:01:00.000Z",
    expiresAt: "2026-07-22T18:06:00.000Z",
    confirmedOrderId: null,
    confirmedAt: null,
    releasedAt: null,
    releaseReason: null,
    ...overrides
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  correlationId: string,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-correlation-id": correlationId,
      ...headers
    }
  });
}

function errorResponse(status: number, correlationId: string, code: string) {
  return jsonResponse(
    { code, message: "Controlled upstream failure.", correlationId },
    status,
    correlationId
  );
}

function tokenProvider(tokens: string[] = ["access-token"]) {
  let index = 0;
  return {
    getAccessToken: vi.fn(async () => tokens[Math.min(index++, tokens.length - 1)]),
    invalidate: vi.fn(() => undefined)
  };
}

function requestHeaders(fetchMock: ReturnType<typeof vi.fn>, call: number) {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe("OrderPRO V4 local-delivery client", () => {
  it("sends the exact paths, methods, headers and bodies for quote/hold/recovery/confirm/release", async () => {
    const provider = tokenProvider();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quoteResult("corr-quote-001"), 200, "corr-quote-001"))
      .mockResolvedValueOnce(
        jsonResponse({ hold: hold("corr-hold-001"), replayed: false }, 201, "corr-hold-001")
      )
      .mockResolvedValueOnce(
        jsonResponse({ hold: hold("created-correlation") }, 200, "corr-get-001")
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            hold: hold("created-correlation", {
              status: "CONFIRMED",
              confirmedOrderId: "square-order-pilot-1",
              confirmedAt: "2026-07-22T18:02:00.000Z"
            }),
            changed: true
          },
          200,
          "corr-confirm-001"
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            hold: hold("created-correlation", {
              status: "RELEASED",
              releasedAt: "2026-07-22T18:03:00.000Z",
              releaseReason: "ORDER_CANCELLED"
            }),
            changed: true
          },
          200,
          "corr-release-001"
        )
      );
    const client = createOrderProClient({
      config,
      tokenProvider: provider,
      fetchImpl: fetchMock as typeof fetch
    });

    await expect(
      client.quote(quoteInput, {
        correlationId: "corr-quote-001",
        idempotencyKey: "idem-quote-001"
      })
    ).resolves.toMatchObject({ quoteId: "quote-pilot-a", correlationId: "corr-quote-001" });
    await expect(
      client.createHold(
        { quoteId: "quote-pilot-a", slotId: "slot-pilot-1" },
        { correlationId: "corr-hold-001", idempotencyKey: "idem-hold-001" }
      )
    ).resolves.toMatchObject({ hold: { capacityHoldId: "hold-pilot-1" }, replayed: false });
    await expect(
      client.getHold("hold-pilot-1", { correlationId: "corr-get-001" })
    ).resolves.toMatchObject({ hold: { status: "HELD" } });
    await expect(
      client.confirmHold("hold-pilot-1", {
        correlationId: "corr-confirm-001",
        orderId: "square-order-pilot-1"
      })
    ).resolves.toMatchObject({ hold: { status: "CONFIRMED" }, changed: true });
    await expect(
      client.releaseHold("hold-pilot-1", {
        correlationId: "corr-release-001",
        reason: "ORDER_CANCELLED"
      })
    ).resolves.toMatchObject({ hold: { status: "RELEASED" }, changed: true });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://orderpro-staging.vercel.app/api/v1/local-delivery/quote",
      "https://orderpro-staging.vercel.app/api/v1/local-delivery/holds",
      "https://orderpro-staging.vercel.app/api/v1/local-delivery/holds/hold-pilot-1",
      "https://orderpro-staging.vercel.app/api/v1/local-delivery/holds/hold-pilot-1/confirm",
      "https://orderpro-staging.vercel.app/api/v1/local-delivery/holds/hold-pilot-1/release"
    ]);

    const expectedRequests = [
      {
        method: "POST",
        correlationId: "corr-quote-001",
        idempotencyKey: "idem-quote-001",
        body: quoteInput
      },
      {
        method: "POST",
        correlationId: "corr-hold-001",
        idempotencyKey: "idem-hold-001",
        body: { quoteId: "quote-pilot-a", slotId: "slot-pilot-1" }
      },
      { method: "GET", correlationId: "corr-get-001" },
      {
        method: "POST",
        correlationId: "corr-confirm-001",
        body: { orderId: "square-order-pilot-1" }
      },
      {
        method: "POST",
        correlationId: "corr-release-001",
        body: { reason: "ORDER_CANCELLED" }
      }
    ];

    expectedRequests.forEach((expected, index) => {
      const init = fetchMock.mock.calls[index]?.[1] as RequestInit;
      const headers = requestHeaders(fetchMock, index);
      expect(init).toMatchObject({
        method: expected.method,
        cache: "no-store",
        redirect: "error"
      });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("authorization")).toBe("Bearer access-token");
      expect(headers.get("x-correlation-id")).toBe(expected.correlationId);
      expect(headers.get("idempotency-key")).toBe(expected.idempotencyKey ?? null);
      expect(headers.get("content-type")).toBe(
        expected.body === undefined ? null : "application/json"
      );
      expect(init.body).toBe(
        expected.body === undefined ? undefined : JSON.stringify(expected.body)
      );
    });
  });

  it("refreshes exactly once after 401 while preserving correlation, idempotency and body", async () => {
    const correlationId = "corr-refresh-001";
    const provider = tokenProvider(["expired-token", "fresh-token"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401, correlationId, "UNAUTHORIZED"))
      .mockResolvedValueOnce(jsonResponse(quoteResult(correlationId), 200, correlationId));
    const client = createOrderProClient({
      config,
      tokenProvider: provider,
      fetchImpl: fetchMock as typeof fetch,
      createIdempotencyKey: () => "generated-idem-001"
    });

    await expect(client.quote(quoteInput, { correlationId })).resolves.toMatchObject({
      quoteId: "quote-pilot-a"
    });

    expect(provider.invalidate).toHaveBeenCalledTimes(1);
    expect(provider.getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(firstInit.body).toBe(secondInit.body);
    expect(requestHeaders(fetchMock, 0).get("x-correlation-id")).toBe(correlationId);
    expect(requestHeaders(fetchMock, 1).get("x-correlation-id")).toBe(correlationId);
    expect(requestHeaders(fetchMock, 0).get("idempotency-key")).toBe("generated-idem-001");
    expect(requestHeaders(fetchMock, 1).get("idempotency-key")).toBe("generated-idem-001");
    expect(requestHeaders(fetchMock, 0).get("authorization")).toBe("Bearer expired-token");
    expect(requestHeaders(fetchMock, 1).get("authorization")).toBe("Bearer fresh-token");
  });

  it("stops after the one allowed refresh when the second response is also 401", async () => {
    const correlationId = "corr-double-401";
    const provider = tokenProvider(["expired-token", "rejected-fresh-token"]);
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => errorResponse(401, correlationId, "UNAUTHORIZED"));
    const client = createOrderProClient({
      config,
      tokenProvider: provider,
      fetchImpl: fetchMock as typeof fetch
    });

    await expect(
      client.getHold("hold-pilot-1", { correlationId })
    ).rejects.toMatchObject({
      code: "ORDERPRO_AUTHENTICATION_FAILED",
      status: 401,
      correlationId
    });
    expect(provider.invalidate).toHaveBeenCalledTimes(1);
    expect(provider.getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [403, "INSUFFICIENT_SCOPE", "ORDERPRO_INSUFFICIENT_SCOPE"],
    [409, "IDEMPOTENCY_CONFLICT", "ORDERPRO_CONFLICT"],
    [410, "QUOTE_EXPIRED", "ORDERPRO_QUOTE_EXPIRED"],
    [429, "RATE_LIMITED", "ORDERPRO_RATE_LIMITED"],
    [503, "DEPENDENCY_UNAVAILABLE", "ORDERPRO_UNAVAILABLE"]
  ])("does not retry HTTP %i", async (status, upstreamCode, expectedCode) => {
    const correlationId = `corr-status-${status}`;
    const provider = tokenProvider();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(errorResponse(status, correlationId, upstreamCode));
    const client = createOrderProClient({
      config,
      tokenProvider: provider,
      fetchImpl: fetchMock as typeof fetch
    });

    await expect(
      client.getHold("hold-pilot-1", { correlationId })
    ).rejects.toMatchObject({
      code: expectedCode,
      status,
      correlationId,
      upstreamCode
    });
    expect(provider.invalidate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a success body has a different correlation ID", async () => {
    const correlationId = "corr-request-001";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(quoteResult("corr-body-other"), 200, correlationId)
    );
    const client = createOrderProClient({
      config,
      tokenProvider: tokenProvider(),
      fetchImpl: fetchMock as typeof fetch
    });

    await expect(client.quote(quoteInput, { correlationId })).rejects.toMatchObject({
      code: "ORDERPRO_PROTOCOL_ERROR",
      status: 200,
      correlationId
    });
  });

  it.each([
    ["a non-JSON content type", "text/plain", JSON.stringify(quoteResult("corr-protocol-001")), {}],
    ["invalid JSON", "application/json", "{", {}],
    [
      "an oversized declared body",
      "application/json",
      JSON.stringify(quoteResult("corr-protocol-001")),
      { "content-length": String(ORDERPRO_MAX_RESPONSE_BYTES + 1) }
    ]
  ])("rejects %s", async (_label, contentType, responseBody, extraHeaders) => {
    const correlationId = "corr-protocol-001";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(responseBody, {
        status: 200,
        headers: {
          "content-type": contentType,
          "x-correlation-id": correlationId,
          ...extraHeaders
        }
      })
    );
    const client = createOrderProClient({
      config,
      tokenProvider: tokenProvider(),
      fetchImpl: fetchMock as typeof fetch
    });

    await expect(client.quote(quoteInput, { correlationId })).rejects.toMatchObject({
      code: "ORDERPRO_PROTOCOL_ERROR",
      status: 200,
      correlationId
    });
  });

  it("rejects an oversized streamed body even without content-length", async () => {
    const correlationId = "corr-stream-size-001";
    const oversizedBody = new Uint8Array(ORDERPRO_MAX_RESPONSE_BYTES + 1);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(oversizedBody);
            controller.close();
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-correlation-id": correlationId
          }
        }
      )
    );
    const client = createOrderProClient({
      config,
      tokenProvider: tokenProvider(),
      fetchImpl: fetchMock as typeof fetch
    });

    await expect(client.quote(quoteInput, { correlationId })).rejects.toMatchObject({
      code: "ORDERPRO_PROTOCOL_ERROR",
      status: 200,
      correlationId
    });
  });

  it("keeps the timeout active while the response body is streaming", async () => {
    const correlationId = "corr-stream-timeout";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-correlation-id": correlationId
        }
      })
    );
    const client = createOrderProClient({
      config,
      tokenProvider: tokenProvider(),
      fetchImpl: fetchMock as typeof fetch,
      timeoutMs: 25
    });

    await expect(client.quote(quoteInput, { correlationId })).rejects.toMatchObject({
      code: "ORDERPRO_REQUEST_TIMEOUT",
      status: null,
      correlationId
    });
  });

  it("rejects invalid inputs locally before acquiring a token or making a request", async () => {
    const provider = tokenProvider();
    const fetchMock = vi.fn();
    const client = createOrderProClient({
      config,
      tokenProvider: provider,
      fetchImpl: fetchMock as typeof fetch,
      createCorrelationId: () => "generated-correlation",
      createIdempotencyKey: () => "generated-idempotency"
    });

    const invalidCalls = [
      () => client.quote({ ...quoteInput, cartLines: [] }),
      () => client.createHold({ quoteId: "../quote", slotId: "slot-pilot-1" }),
      () => client.getHold("hold/with/slash"),
      () => client.confirmHold("hold-pilot-1", { orderId: "order with spaces" }),
      () => client.releaseHold("hold-pilot-1", { reason: "NOT_ALLOWED" as never }),
      () => client.quote(quoteInput, { correlationId: "correlation with spaces" }),
      () => client.quote(quoteInput, { idempotencyKey: "short" })
    ];

    for (const call of invalidCalls) {
      const error = await call().catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(OrderProClientError);
      expect(error).toMatchObject({ code: "ORDERPRO_INVALID_CLIENT_INPUT", status: null });
    }
    expect(provider.getAccessToken).not.toHaveBeenCalled();
    expect(provider.invalidate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
