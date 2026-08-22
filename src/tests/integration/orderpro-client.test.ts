// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createOrderProClient, OrderProClientError } from "@/server/orderpro/client";
import type { OrderProApiConfiguration } from "@/server/orderpro/config";
import { orderProFulfillmentStatusResultSchema } from "@/server/orderpro/contracts";
import fulfillmentStatusFixture from "../../../docs/orderpro-fulfillment-status-v1.fixture.json";

const correlationId = "11111111-1111-4111-8111-111111111111";
const differentCorrelationId = "22222222-2222-4222-8222-222222222222";

const config: OrderProApiConfiguration = {
  baseUrl: "https://orderpro-staging.vercel.app"
};

function successResponse(id = correlationId) {
  return new Response(
    JSON.stringify({
      result: "AUTHENTICATED",
      clientId: "storefront-staging",
      environment: "STAGING",
      scopes: ["local-delivery:holds", "local-delivery:quote"],
      localDeliveryApiStatus: "DEPENDENCY_BLOCKED",
      correlationId: id
    }),
    { status: 200, headers: { "content-type": "application/json", "x-correlation-id": id } }
  );
}

function failureResponse(status: number, result: "UNAUTHORIZED" | "FORBIDDEN" | "FAILED_CLOSED", code: string, id = correlationId) {
  return new Response(JSON.stringify({ result, code, correlationId: id }), {
    status,
    headers: { "content-type": "application/json", "x-correlation-id": id }
  });
}

function tokenProvider(tokens = ["access-token"]) {
  return {
    getAccessToken: vi.fn().mockImplementation(async () => tokens.shift() ?? "access-token"),
    invalidate: vi.fn(() => undefined)
  };
}

describe("OrderPRO client", () => {
  it("accepts the exact provider fixture", () => {
    expect(orderProFulfillmentStatusResultSchema.parse(fulfillmentStatusFixture)).toEqual(
      fulfillmentStatusFixture
    );
  });
  it("performs the exact authenticated handshake without exposing the token", async () => {
    const provider = tokenProvider();
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    const observer = vi.fn();
    const client = createOrderProClient({
      config,
      tokenProvider: provider,
      fetchImpl: fetchMock as typeof fetch,
      createCorrelationId: () => correlationId,
      now: () => 100,
      observer
    });

    const result = await client.authCheck();

    expect(result).toMatchObject({
      result: "AUTHENTICATED",
      clientId: "storefront-staging",
      localDeliveryApiStatus: "DEPENDENCY_BLOCKED",
      correlationId
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://orderpro-staging.vercel.app/api/v1/local-delivery/auth-check");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(headers.get("authorization")).toBe("Bearer access-token");
    expect(headers.get("x-correlation-id")).toBe(correlationId);
    expect(JSON.stringify(result)).not.toContain("access-token");
    expect(observer).toHaveBeenCalledWith({
      event: "orderpro.auth_check",
      correlationId,
      attempt: 1,
      outcome: "AUTHENTICATED",
      httpStatus: 200,
      durationMs: 0,
      localDeliveryApiStatus: "DEPENDENCY_BLOCKED"
    });
    expect(JSON.stringify(observer.mock.calls)).not.toContain("access-token");
  });

  it("invalidates and refreshes once after a 401", async () => {
    const provider = tokenProvider(["expired-token", "fresh-token"]);
    const fetchMock = vi.fn().mockResolvedValueOnce(failureResponse(401, "UNAUTHORIZED", "UNAUTHORIZED")).mockResolvedValueOnce(successResponse());
    const client = createOrderProClient({ config, tokenProvider: provider, fetchImpl: fetchMock as typeof fetch, createCorrelationId: () => correlationId });

    await expect(client.authCheck()).resolves.toMatchObject({ result: "AUTHENTICATED" });
    expect(provider.invalidate).toHaveBeenCalledTimes(1);
    expect(provider.getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry insufficient scopes", async () => {
    const provider = tokenProvider();
    const fetchMock = vi.fn().mockResolvedValue(failureResponse(403, "FORBIDDEN", "INSUFFICIENT_SCOPE"));
    const client = createOrderProClient({ config, tokenProvider: provider, fetchImpl: fetchMock as typeof fetch, createCorrelationId: () => correlationId });

    await expect(client.authCheck()).rejects.toMatchObject({
      code: "ORDERPRO_INSUFFICIENT_SCOPE",
      status: 403,
      correlationId
    });
    expect(provider.invalidate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when body and header correlation do not match the request", async () => {
    const provider = tokenProvider();
    const fetchMock = vi.fn().mockResolvedValue(successResponse(differentCorrelationId));
    const client = createOrderProClient({ config, tokenProvider: provider, fetchImpl: fetchMock as typeof fetch, createCorrelationId: () => correlationId });

    const error = await client.authCheck().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(OrderProClientError);
    expect(error).toMatchObject({ code: "ORDERPRO_PROTOCOL_ERROR", correlationId });
    expect(String(error)).not.toContain("access-token");
  });

  it("maps dependency failures without replaying the request", async () => {
    const provider = tokenProvider();
    const fetchMock = vi.fn().mockResolvedValue(failureResponse(503, "FAILED_CLOSED", "M2M_AUTH_NOT_CONFIGURED"));
    const client = createOrderProClient({ config, tokenProvider: provider, fetchImpl: fetchMock as typeof fetch, createCorrelationId: () => correlationId });

    await expect(client.authCheck()).rejects.toMatchObject({
      code: "ORDERPRO_NOT_READY",
      status: 503,
      correlationId
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched failure result, code and HTTP status combinations", async () => {
    const provider = tokenProvider();
    const fetchMock = vi.fn().mockResolvedValue(failureResponse(401, "FAILED_CLOSED", "M2M_AUTH_NOT_CONFIGURED"));
    const client = createOrderProClient({ config, tokenProvider: provider, fetchImpl: fetchMock as typeof fetch, createCorrelationId: () => correlationId });

    await expect(client.authCheck()).rejects.toMatchObject({
      code: "ORDERPRO_PROTOCOL_ERROR",
      status: 401,
      correlationId
    });
    expect(provider.invalidate).not.toHaveBeenCalled();
  });

  it("preserves the second failure classification after refreshing a rejected token", async () => {
    const provider = tokenProvider(["expired-token", "fresh-token"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failureResponse(401, "UNAUTHORIZED", "UNAUTHORIZED"))
      .mockResolvedValueOnce(failureResponse(403, "FORBIDDEN", "INSUFFICIENT_SCOPE"));
    const client = createOrderProClient({ config, tokenProvider: provider, fetchImpl: fetchMock as typeof fetch, createCorrelationId: () => correlationId });

    await expect(client.authCheck()).rejects.toMatchObject({
      code: "ORDERPRO_INSUFFICIENT_SCOPE",
      status: 403,
      correlationId
    });
    expect(provider.invalidate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("consumes the normalized fulfillment status contract with M2M correlation", async () => {
    const provider = tokenProvider();
    const status = {
      checkoutAttemptId: "checkout-attempt-1",
      orderproOrderId: "00000000-0000-4000-8000-000000000101",
      fulfillmentMode: "PICKUP",
      normalizedStatus: "PAYMENT_PENDING",
      nativeStatus: "HELD",
      reservationId: "00000000-0000-4000-8000-000000000103",
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "square-link-1",
      squarePaymentId: null,
      expiresAt: "2026-08-18T16:00:00.000Z",
      amountPaidCents: null,
      currency: null,
      version: 2,
      updatedAt: "2026-08-18T15:50:00.000Z",
      requiresIntervention: false
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, status, correlationId }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-correlation-id": correlationId
        }
      }
    ));
    const client = createOrderProClient({
      config,
      tokenProvider: provider,
      fetchImpl: fetchMock as typeof fetch,
      createCorrelationId: () => correlationId
    });

    await expect(client.getFulfillmentStatus({
      checkoutAttemptId: "checkout-attempt-1"
    })).resolves.toEqual({ ok: true, status, correlationId });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://orderpro-staging.vercel.app/api/internal/storefront/fulfillment-status?checkoutAttemptId=checkout-attempt-1"
    );
    expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
  });
});
