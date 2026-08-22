// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  createOrderProStorefrontFulfillmentClient,
  getOrderProStorefrontFulfillmentConfiguration
} from "@/server/orderpro/storefront-fulfillment-client";

const scopes = "local-delivery:quote local-delivery:reserve local-delivery:settle pickup:quote pickup:reserve pickup:settle";
const config = {
  baseUrl: "https://orderpro.test",
  authMode: "AUTH0" as const,
  tokenEndpoint: "https://tenant.auth0.com/oauth/token",
  audience: "https://api.orderpro.internal/storefront",
  clientId: "storefront-client",
  clientSecret: "server-secret",
  scopes: [
    "local-delivery:quote",
    "local-delivery:reserve",
    "local-delivery:settle",
    "pickup:quote",
    "pickup:reserve",
    "pickup:settle"
  ] as const
};

const hold = {
  capacityHoldId: "10000000-0000-4000-8000-000000000010",
  quoteId: "10000000-0000-4000-8000-000000000001",
  slotId: "pickup-third_avenue-2026-08-21-1030",
  locationId: "third_avenue",
  clientId: "storefront-staging",
  correlationId: "split-capacity:attempt-1:regular",
  inventoryReservationId: "10000000-0000-4000-8000-000000000011",
  capacitySeconds: 1,
  status: "HELD",
  createdAt: "2026-08-19T18:00:00.000Z",
  expiresAt: "2026-08-19T18:15:00.000Z",
  confirmedOrderId: null,
  confirmedAt: null,
  releasedAt: null,
  releaseReason: null
} as const;

describe("OrderPRO reservable Storefront fulfillment client", () => {
  it("fails closed unless the base URL and exact least-privilege scopes are configured", () => {
    const environment = {
      ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL: "https://orderpro.example.com/path",
      ORDERPRO_STOREFRONT_FULFILLMENT_AUTH_MODE: "AUTH0",
      ORDERPRO_AUTH0_ISSUER: "https://tenant.auth0.com/",
      ORDERPRO_AUTH0_AUDIENCE: config.audience,
      ORDERPRO_AUTH0_CLIENT_ID: config.clientId,
      ORDERPRO_AUTH0_CLIENT_SECRET: config.clientSecret,
      ORDERPRO_STOREFRONT_FULFILLMENT_AUTH0_SCOPES: scopes
    };

    expect(getOrderProStorefrontFulfillmentConfiguration(environment)).toMatchObject({
      baseUrl: "https://orderpro.example.com",
      tokenEndpoint: "https://tenant.auth0.com/oauth/token",
      scopes: config.scopes
    });
    expect(getOrderProStorefrontFulfillmentConfiguration({
      ...environment,
      ORDERPRO_STOREFRONT_FULFILLMENT_AUTH0_SCOPES: "pickup:quote pickup:reserve pickup:settle"
    })).toBeNull();
  });

  it("reserves Pickup with bearer auth and stable request identities", async () => {
    const tokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("header.payload.signature"),
      invalidate: vi.fn()
    };
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const correlationId = new Headers(init?.headers).get("x-correlation-id") ?? "";
      return json({
        ok: true,
        replayed: false,
        checkoutAttemptId: "attempt-1:regular",
        fulfillmentMode: "PICKUP",
        hold: { ...hold, correlationId }
      }, 201, correlationId);
    });
    const client = createOrderProStorefrontFulfillmentClient({ config, tokenProvider, fetchImpl: fetchMock });

    const result = await client.reservePickup({
      quoteId: hold.quoteId,
      slotId: hold.slotId,
      checkoutAttemptId: "attempt-1:regular",
      idempotencyKey: "split-capacity:attempt-1:regular",
      correlationId: "split-capacity:attempt-1:regular"
    });

    expect(result.hold.capacityHoldId).toBe(hold.capacityHoldId);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://orderpro.test/api/internal/storefront/pickup-capacity-reservation");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: expect.objectContaining({
        authorization: "Bearer header.payload.signature",
        "idempotency-key": "split-capacity:attempt-1:regular",
        "x-correlation-id": "split-capacity:attempt-1:regular"
      })
    });
  });

  it("uses only the endpoint-specific shared secret in sandbox mode", async () => {
    const sharedSecretConfig = {
      baseUrl: "https://orderpro.test",
      authMode: "SHARED_SECRET" as const,
      sharedSecrets: {
        pickupQuote: "pickup-quote-secret-0000000000000001",
        pickupReservation: "pickup-reservation-secret-00000001",
        durableQuote: "durable-quote-secret-00000000000001",
        walkingReservation: "walking-reservation-secret-0000001",
        capacityCheckout: "capacity-checkout-secret-000000001"
      }
    };
    const correlationId = "pickup-quote:attempt-1";
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-orderpro-pickup-quote-key")).toBe(sharedSecretConfig.sharedSecrets.pickupQuote);
      expect(headers.get("x-orderpro-pickup-reservation-key")).toBeNull();
      expect(headers.get("x-orderpro-durable-quote-key")).toBeNull();
      expect(headers.get("x-orderpro-walking-reservation-key")).toBeNull();
      expect(headers.get("x-orderpro-capacity-checkout-key")).toBeNull();
      return json({
        ok: true,
        quoteId: hold.quoteId,
        quoteClientId: "storefront-sandbox",
        replayed: false,
        mode: "PICKUP",
        eligible: true,
        bookable: true,
        reservationCapability: "HOLD_READY",
        locationId: "third_avenue",
        requestedDate: "2026-08-21",
        requiredCapacityOrders: 1,
        holdTtlSeconds: 900,
        availableSlots: [],
        expiresAt: hold.expiresAt,
        correlationId
      }, 200, correlationId);
    });
    const client = createOrderProStorefrontFulfillmentClient({
      config: sharedSecretConfig,
      fetchImpl: fetchMock
    });

    await expect(client.quotePickup({
      locationId: "third_avenue",
      requestedDate: "2026-08-21",
      cartLines: [{ squareVariationId: "variation-1", quantity: 1 }],
      idempotencyKey: correlationId,
      correlationId
    })).resolves.toMatchObject({ quoteId: hold.quoteId });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("invalidates one rejected token and safely retries the exact bind", async () => {
    const tokenProvider = {
      getAccessToken: vi.fn().mockResolvedValueOnce("header.old.signature").mockResolvedValueOnce("header.new.signature"),
      invalidate: vi.fn()
    };
    const checkout = {
      capacityHoldId: hold.capacityHoldId,
      checkoutAttemptId: "attempt-1:regular",
      fulfillmentMode: "PICKUP",
      status: "BOUND",
      expiresAt: hold.expiresAt,
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "square-link-1",
      squarePaymentId: null,
      squareLocationId: "square-location-1",
      amountPaidCents: null,
      currency: null,
      boundAt: "2026-08-19T18:01:00.000Z",
      paidAt: null,
      releasedAt: null,
      releaseReason: null,
      version: 2
    } as const;
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      const correlationId = headers.get("x-correlation-id") ?? "";
      if (headers.get("authorization")?.includes("old")) {
        return json({ ok: false, code: "UNAUTHORIZED", message: "denied" }, 401, correlationId);
      }
      return json({ ok: true, checkout, hold, changed: true }, 200, correlationId);
    });
    const client = createOrderProStorefrontFulfillmentClient({ config, tokenProvider, fetchImpl: fetchMock });

    await expect(client.bind({
      capacityHoldId: hold.capacityHoldId,
      squareOrderId: "square-order-1",
      squarePaymentLinkId: "square-link-1",
      squareLocationId: "square-location-1",
      idempotencyKey: `capacity-bind:${hold.capacityHoldId}`,
      correlationId: `capacity-bind:${hold.capacityHoldId}`
    })).resolves.toMatchObject({ changed: true, checkout: { status: "BOUND" } });
    expect(tokenProvider.invalidate).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(fetchMock.mock.calls[1]?.[1]?.body);
  });
});

function json(body: unknown, status: number, correlationId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-correlation-id": correlationId }
  });
}
