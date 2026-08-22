// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createOrderProShippingOrderClient,
  getOrderProShippingOrderConfiguration,
  orderProShippingCommandIdentity
} from "@/server/orderpro/shipping-order-client";

const order = {
  id: "00000000-0000-4000-8000-000000000101",
  status: "CANCELLED",
  checkoutAttemptId: "checkout-attempt-1",
  sourceLocationId: "store-3rd-avenue",
  consolidationLocationId: "warehouse-englewood",
  policyVersion: "shipping.v1",
  readyToShipDate: "2026-08-19",
  expiresAt: "2026-08-18T16:00:00.000Z",
  squareOrderId: null,
  squarePaymentLinkId: null,
  squarePaymentId: null,
  lines: [],
  transferTask: null
};

function success() {
  return new Response(JSON.stringify({ ok: true, changed: true, order }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("OrderPRO Shipping order client", () => {
  it("requests canonical shipping availability with the quote identity headers", async () => {
    const fetchMock = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1]
    ) => {
      void _input;
      void _init;
      return Response.json({
        ok: true,
        available: false,
        reasonCode: "INSUFFICIENT_PHYSICAL_STOCK"
      });
    });
    const client = createOrderProShippingOrderClient({
      config: {
        baseUrl: "https://orderpro.example.com",
        sharedSecret: "s".repeat(32)
      },
      fetchImpl: fetchMock as typeof fetch
    });
    const identity = orderProShippingCommandIdentity("quote", "store-3rd-avenue", "cart-hash");

    const result = await client.quote({
      locationId: "store-3rd-avenue",
      items: [{ squareVariationId: "variation-a", quantity: 1 }],
      idempotencyKey: identity,
      correlationId: identity
    });

    expect(result).toMatchObject({ available: false, reasonCode: "INSUFFICIENT_PHYSICAL_STOCK" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://orderpro.example.com/api/internal/storefront/shipping/quote");
    expect(new Headers(init?.headers).get("idempotency-key")).toBe(identity);
  });

  it("never enables the legacy shared secret in production", () => {
    expect(getOrderProShippingOrderConfiguration({
      ORDERPRO_INTEGRATION_ENVIRONMENT: "PRODUCTION",
      ORDERPRO_STOREFRONT_PREVIEW_BASE_URL: "https://orderpro.example.com",
      ORDERPRO_STOREFRONT_SHIPPING_SHARED_SECRET: "s".repeat(32)
    })).toBeNull();
  });

  it("uses M2M bearer auth and keeps command identity out of the body", async () => {
    const tokenProvider = {
      getAccessToken: vi.fn(async () => "header.payload.signature"),
      invalidate: vi.fn()
    };
    const fetchMock = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1]
    ) => {
      void _input;
      void _init;
      return success();
    });
    const client = createOrderProShippingOrderClient({
      config: {
        baseUrl: "https://orderpro.example.com",
        tokenProvider
      },
      fetchImpl: fetchMock as typeof fetch
    });
    const identity = orderProShippingCommandIdentity(
      "release",
      "checkout-attempt-1",
      "expired"
    );

    await client.release({
      shippingOrderId: order.id,
      reason: "ABANDONED",
      idempotencyKey: identity,
      correlationId: identity
    });

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://orderpro.example.com/api/internal/storefront/shipping/release");
    expect(headers.get("authorization")).toBe("Bearer header.payload.signature");
    expect(headers.get("x-orderpro-shipping-key")).toBeNull();
    expect(headers.get("idempotency-key")).toBe(identity);
    expect(headers.get("x-correlation-id")).toBe(identity);
    expect(JSON.parse(String(init?.body))).toEqual({
      shippingOrderId: order.id,
      reason: "ABANDONED"
    });
  });

  it("refreshes a rejected M2M token exactly once", async () => {
    const tokenProvider = {
      getAccessToken: vi.fn()
        .mockResolvedValueOnce("header.expired.signature")
        .mockResolvedValueOnce("header.fresh.signature"),
      invalidate: vi.fn()
    };
    const fetchMock = vi.fn<(
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "UNAUTHORIZED" }), { status: 401 }))
      .mockResolvedValueOnce(success());
    const client = createOrderProShippingOrderClient({
      config: { baseUrl: "https://orderpro.example.com", tokenProvider },
      fetchImpl: fetchMock as typeof fetch
    });
    const identity = orderProShippingCommandIdentity("release", "checkout-attempt-1");

    await client.release({
      shippingOrderId: order.id,
      reason: "ABANDONED",
      idempotencyKey: identity,
      correlationId: identity
    });

    expect(tokenProvider.invalidate).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("authorization"))
      .toBe("Bearer header.fresh.signature");
  });

  it("derives bounded stable identities without exposing raw provider IDs", () => {
    const first = orderProShippingCommandIdentity("confirm", "sensitive-payment-id");
    const replay = orderProShippingCommandIdentity("confirm", "sensitive-payment-id");
    const changed = orderProShippingCommandIdentity("confirm", "other-payment-id");

    expect(first).toBe(replay);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^shipping-confirm:v1:[0-9a-f]{64}$/);
    expect(first).not.toContain("sensitive-payment-id");
    expect(first.length).toBeLessThanOrEqual(120);
  });
});
