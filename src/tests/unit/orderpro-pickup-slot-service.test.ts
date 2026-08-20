/**
 * Verifies the isolated behavior of OrderPro pickup slot service.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { earliestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";
import {
  getOrderProPickupAvailability,
  isOrderProPickupTestMode,
  validateOrderProPickupSelection
} from "@/server/orderpro/orderpro-pickup-slot-service";

describe("OrderPro pickup slot gateway", () => {
  const cartLines = [{ squareVariationId: "variation-1", quantity: 1 }];
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never enables mock pickup slots in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_CATALOG_FIXTURE", "true");
    vi.stubEnv("ORDERPRO_PICKUP_TEST_MODE", "true");

    expect(isOrderProPickupTestMode()).toBe(false);
  });

  it("does not invent pickup slots before OrderPro returns them", async () => {
    const requestedDate = earliestNewYorkDeliveryDate();
    const availability = await getOrderProPickupAvailability({ locationId: "store-3rd-avenue", requestedDate, cartLines });

    expect(availability).toMatchObject({
      available: true,
      source: "MOCK",
      locationId: "store-3rd-avenue",
      requestedDate
    });
    if (availability.available) {
      expect(availability.availableSlots).toEqual([]);
    }
  });

  it("rejects a slot that OrderPro no longer returns", async () => {
    const requestedDate = earliestNewYorkDeliveryDate();
    await expect(validateOrderProPickupSelection({
      locationId: "store-86th-street",
      requestedDate,
      slotId: "missing-slot",
      cartLines
    })).resolves.toMatchObject({ valid: false });
  });

  it("reads production pickup slots from the private OrderPRO connection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL", "http://orderpro:3000");
    vi.stubEnv("ORDERPRO_STOREFRONT_FULFILLMENT_AUTH_MODE", "AUTH0");
    vi.stubEnv("ORDERPRO_AUTH0_ISSUER", "https://tenant.auth0.com/");
    vi.stubEnv("ORDERPRO_AUTH0_AUDIENCE", "https://api.orderpro.internal/storefront");
    vi.stubEnv("ORDERPRO_AUTH0_CLIENT_ID", "storefront-client");
    vi.stubEnv("ORDERPRO_AUTH0_CLIENT_SECRET", "server-secret");
    vi.stubEnv("ORDERPRO_STOREFRONT_FULFILLMENT_AUTH0_SCOPES", "local-delivery:quote local-delivery:reserve local-delivery:settle pickup:quote pickup:reserve pickup:settle");
    const requestedDate = earliestNewYorkDeliveryDate();
    const startsAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 60 * 60_000).toISOString();
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/oauth/token")) {
        return new Response(JSON.stringify({
          access_token: "header.payload.signature",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "local-delivery:quote local-delivery:reserve local-delivery:settle pickup:quote pickup:reserve pickup:settle"
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const correlationId = new Headers(init?.headers).get("x-correlation-id") ?? "";
      return new Response(JSON.stringify({
        ok: true,
        quoteId: "10000000-0000-4000-8000-000000000001",
        quoteClientId: "storefront-staging",
        replayed: false,
        mode: "PICKUP",
        eligible: true,
        bookable: true,
        reservationCapability: "HOLD_READY",
        locationId: "east_86th_street",
        requestedDate,
        requiredCapacityOrders: 1,
        holdTtlSeconds: 900,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        correlationId,
        availableSlots: [{
          slotId: "pickup-east_86th_street-slot-1",
          slotClass: "STANDARD",
          startsAt,
          endsAt,
          pickupUntilAt: null,
          capacityOrders: 2,
          remainingOrders: 1
        }]
      }), { status: 200, headers: { "content-type": "application/json", "x-correlation-id": correlationId } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const availability = await getOrderProPickupAvailability({
      locationId: "store-86th-street",
      requestedDate,
      cartLines
    });

    expect(availability).toMatchObject({
      available: true,
      source: "ORDERPRO",
      locationId: "store-86th-street",
      requestedDate,
      availableSlots: [{
        id: "pickup-east_86th_street-slot-1"
      }]
    });
    const refreshedAvailability = await getOrderProPickupAvailability({
      locationId: "store-86th-street",
      requestedDate,
      cartLines
    });
    expect(refreshedAvailability).toMatchObject({ available: true, source: "ORDERPRO" });
    await getOrderProPickupAvailability({
      locationId: "store-86th-street",
      requestedDate,
      cartLines
    }, { quoteRequestId: "checkout-request-stable-001" });
    await getOrderProPickupAvailability({
      locationId: "store-86th-street",
      requestedDate,
      cartLines
    }, { quoteRequestId: "checkout-request-stable-001" });
    const checkoutCartLines = cartLines.map((line) => ({ ...line, source: "storefront" as const }));
    const validation = await validateOrderProPickupSelection({
      locationId: "store-86th-street",
      requestedDate,
      slotId: "pickup-east_86th_street-slot-1",
      cartLines: checkoutCartLines,
      context: "regular"
    }, { quoteRequestId: "checkout-validation-stable-001" });

    expect(validation).toMatchObject({
      valid: true,
      slot: { id: "pickup-east_86th_street-slot-1" }
    });

    const quoteCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/internal/storefront/pickup-quote")
    );
    expect(quoteCalls).toHaveLength(5);
    const firstIdempotencyKey = new Headers(quoteCalls[0]?.[1]?.headers).get("idempotency-key");
    const secondIdempotencyKey = new Headers(quoteCalls[1]?.[1]?.headers).get("idempotency-key");
    const stableIdempotencyKey = new Headers(quoteCalls[2]?.[1]?.headers).get("idempotency-key");
    const stableReplayKey = new Headers(quoteCalls[3]?.[1]?.headers).get("idempotency-key");
    expect(firstIdempotencyKey).toMatch(/^pickup-quote:[a-f0-9]{64}$/);
    expect(secondIdempotencyKey).toMatch(/^pickup-quote:[a-f0-9]{64}$/);
    expect(secondIdempotencyKey).not.toBe(firstIdempotencyKey);
    expect(stableIdempotencyKey).toMatch(/^pickup-quote:[a-f0-9]{64}$/);
    expect(stableReplayKey).toBe(stableIdempotencyKey);
  });
});
