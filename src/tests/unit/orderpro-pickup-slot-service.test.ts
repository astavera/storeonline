/**
 * Verifies the isolated behavior of OrderPro pickup slot service.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { earliestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";
import {
  ORDERPRO_PRODUCTION_AUDIENCE,
  ORDERPRO_PRODUCTION_SCOPES
} from "@/server/orderpro/config";
import {
  getOrderProPickupAvailability,
  isOrderProPickupTestMode,
  validateOrderProPickupSelection
} from "@/server/orderpro/orderpro-pickup-slot-service";

describe("OrderPro pickup slot gateway", () => {
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
    const availability = await getOrderProPickupAvailability({ locationId: "store-3rd-avenue", requestedDate });

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
      quoteId: "00000000-0000-4000-8000-000000000101",
      items: [{ squareVariationId: "variation-1", quantity: 1 }]
    })).resolves.toMatchObject({ valid: false });
  });

  it("reads production Pickup quotes through the scoped M2M connection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDERPRO_M2M_AUTH_MODE", "AUTH0");
    vi.stubEnv("ORDERPRO_INTEGRATION_ENVIRONMENT", "PRODUCTION");
    vi.stubEnv("ORDERPRO_API_BASE_URL", "https://orderpro.example.com");
    vi.stubEnv("ORDERPRO_AUTH0_ISSUER", "https://modern-state.us.auth0.com/");
    vi.stubEnv("ORDERPRO_AUTH0_AUDIENCE", ORDERPRO_PRODUCTION_AUDIENCE);
    vi.stubEnv("ORDERPRO_AUTH0_CLIENT_ID", "storefront-production-client");
    vi.stubEnv("ORDERPRO_AUTH0_CLIENT_SECRET", "secret-value-not-logged");
    vi.stubEnv("ORDERPRO_AUTH0_SCOPES", ORDERPRO_PRODUCTION_SCOPES.join(" "));
    const requestedDate = earliestNewYorkDeliveryDate();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/oauth/token")) {
        return new Response(JSON.stringify({
          access_token: "header.payload.signature",
          token_type: "Bearer",
          expires_in: 300
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const correlationId = new Headers(init?.headers).get("x-correlation-id")!;
      return new Response(JSON.stringify({
        ok: true,
        quoteId: "00000000-0000-4000-8000-000000000101",
        quoteClientId: "storefront-production",
        replayed: false,
        mode: "PICKUP",
        eligible: true,
        bookable: true,
        reservationCapability: "HOLD_READY",
        locationId: "east_86th_street",
        requestedDate,
        requiredCapacityOrders: 1,
        holdTtlSeconds: 900,
        expiresAt: "2026-08-19T18:05:00.000Z",
        correlationId,
        availableSlots: [{
          slotId: `pickup-east_86th_street-${requestedDate}-1030`,
          slotClass: "STANDARD",
          startsAt: `${requestedDate}T10:30:00-04:00`,
          endsAt: `${requestedDate}T11:30:00-04:00`,
          pickupUntilAt: null,
          capacityOrders: 2,
          remainingOrders: 2
        }]
      }), {
        status: 200,
        headers: { "content-type": "application/json", "x-correlation-id": correlationId }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const availability = await getOrderProPickupAvailability({
      locationId: "store-86th-street",
      requestedDate,
      items: [{ squareVariationId: "variation-1", quantity: 1 }]
    });

    expect(availability).toMatchObject({
      available: true,
      source: "ORDERPRO",
      locationId: "store-86th-street",
      requestedDate,
      availableSlots: [{
        id: `pickup-east_86th_street-${requestedDate}-1030`
      }]
    });
    expect(fetchMock.mock.calls.some(([input]) => (
      String(input) === "https://orderpro.example.com/api/internal/storefront/pickup-quote"
    ))).toBe(true);
  });
});
