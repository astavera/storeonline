/**
 * Verifies the isolated behavior of OrderPro local delivery service.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalDeliveryQuoteRequest } from "@/features/fulfillment/contracts/orderpro-local-delivery";
import { earliestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";
import {
  checkMockBalloonPostalEligibility,
  checkOrderProBalloonPostalEligibility,
  isCurrentOrderProLocalDeliverySelection,
  isOrderProDeliveryTestMode,
  quoteOrderProLocalDelivery,
  quoteMockLocalDelivery,
  validateOrderProLocalDeliverySelection
} from "@/server/orderpro/orderpro-local-delivery-service";

describe("OrderPro local delivery test gateway", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never enables mock delivery quotes in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_CATALOG_FIXTURE", "true");
    vi.stubEnv("ORDERPRO_DELIVERY_TEST_MODE", "true");

    expect(isOrderProDeliveryTestMode()).toBe(false);
  });

  it.each(["10021", "10028", "10065", "10075", "10128"])("approves the published balloon delivery ZIP %s", (postalCode) => {
    const eligibility = checkMockBalloonPostalEligibility(postalCode);

    expect(eligibility).toMatchObject({
      eligible: true,
      source: "MOCK",
      postalCode
    });
  });

  it("rejects a ZIP outside the balloon delivery area", () => {
    expect(checkMockBalloonPostalEligibility("10036")).toEqual({
      eligible: false,
      source: "MOCK",
      reasonCode: "OUTSIDE_DELIVERY_AREA",
      message: "OrderPro does not currently approve local balloon delivery for this ZIP code."
    });
  });

  it("rejects malformed ZIP input before asking the gateway", async () => {
    await expect(checkOrderProBalloonPostalEligibility({ postalCode: "1007" })).resolves.toEqual({
      eligible: false,
      source: "MOCK",
      reasonCode: "INVALID_POSTAL_CODE",
      message: "Enter a valid 5-digit ZIP code."
    });
  });

  it("reads production ZIP eligibility from the private OrderPRO connection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDERPRO_STOREFRONT_PREVIEW_BASE_URL", "http://orderpro:3000");
    vi.stubEnv("ORDERPRO_STOREFRONT_PREVIEW_SHARED_SECRET", "test-orderpro-preview-key-that-is-long-enough");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true,
      eligible: true,
      postalCode: "10028",
      approvalId: "approval-10028",
      expiresAt: "2026-07-23T18:05:00.000Z"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkOrderProBalloonPostalEligibility({ postalCode: "10028" })).resolves.toEqual({
      eligible: true,
      source: "ORDERPRO",
      postalCode: "10028",
      approvalId: "approval-10028",
      expiresAt: "2026-07-23T18:05:00.000Z"
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://orderpro:3000/api/staging/local-delivery/postal-eligibility-preview");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "x-orderpro-preview-key": "test-orderpro-preview-key-that-is-long-enough"
      })
    });
  });

  it.each([
    ["500 E 80th St", "10075", "store-3rd-avenue", 4_261, 2_500],
    ["599 E 85th St", "10028", "store-86th-street", 3_924, 2_100],
    ["316 E 82nd Street", "10028", "store-86th-street", 2_816, 1_400]
  ])("quotes the verified fixture %s", (line1, postalCode, locationId, distanceFeet, feeCents) => {
    const quote = quoteMockLocalDelivery(request(line1, postalCode));

    expect(quote).toMatchObject({
      eligible: true,
      source: "MOCK",
      selectedLocationId: locationId,
      walkingDistanceFeet: distanceFeet,
      feeCents,
      feePolicyVersionId: "walking-route-distance-v4-base-10-test"
    });
    if (quote.eligible) {
      expect(quote.availableSlots).toEqual([]);
      expect(quote.estimatedRoundTripMinutes).toBeGreaterThan(quote.walkingDurationMinutes * 2);
    }
  });

  it("maps a production durable OrderPRO quote", async () => {
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
        quoteId: "20000000-0000-4000-8000-000000000001",
        quoteClientId: "storefront-staging",
        replayed: false,
        eligible: true,
        bookable: true,
        reservationCapability: "HOLD_READY",
        reasonCode: "ELIGIBLE",
        normalizedAddress: {
          line1: "500 EAST 80 STREET",
          line2: null,
          city: "New York",
          state: "NY",
          postalCode: "10075",
          country: "US",
          borough: "Manhattan"
        },
        postalCode: "10075",
        selectedLocationId: "third_avenue",
        selectedLocationName: "3rd Avenue Store",
        assignmentRule: "NEAREST_WALKING_ROUTE",
        walkingDistanceFeet: 4261,
        walkingDurationSeconds: 1020,
        estimatedRoundTripDurationSeconds: 2520,
        feeCents: 2500,
        currency: "USD",
        feeTierId: "whole-zone-25",
        availableSlots: [{
          slotId: "delivery-third_avenue-slot-1",
          slotClass: "STANDARD",
          startsAt,
          endsAt,
          capacityOrders: 2,
          remainingOrders: 1,
          pickupUntilAt: null
        }],
        zoneVersionId: "zone-v1",
        feePolicyVersionId: "fee-v1",
        routingProvider: "osrm",
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        correlationId
      }), { status: 200, headers: { "content-type": "application/json", "x-correlation-id": correlationId } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const quote = await quoteOrderProLocalDelivery(request("500 E 80th St", "10075"));

    expect(quote).toMatchObject({
      eligible: true,
      source: "ORDERPRO",
      requestedDate,
      selectedLocationId: "store-3rd-avenue",
      walkingDurationMinutes: 17,
      feeCents: 2500,
      availableSlots: [{
        id: "delivery-third_avenue-slot-1"
      }]
    });

    const refreshedQuote = await quoteOrderProLocalDelivery(request("500 E 80th St", "10075"));
    expect(refreshedQuote).toMatchObject({ eligible: true, source: "ORDERPRO" });
    await quoteOrderProLocalDelivery(
      request("500 E 80th St", "10075"),
      { quoteRequestId: "checkout-request-stable-001" }
    );
    await quoteOrderProLocalDelivery(
      request("500 E 80th St", "10075"),
      { quoteRequestId: "checkout-request-stable-001" }
    );

    const quoteCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/internal/storefront/durable-local-delivery-quote")
    );
    expect(quoteCalls).toHaveLength(8);
    const idempotencyKeys = quoteCalls.map(([, init]) =>
      new Headers(init?.headers).get("idempotency-key")
    );
    for (const key of idempotencyKeys) {
      expect(key).toMatch(/^delivery-quote:[a-f0-9]{64}$/);
    }
    expect(idempotencyKeys[2]).not.toBe(idempotencyKeys[0]);
    expect(idempotencyKeys[3]).not.toBe(idempotencyKeys[1]);
    expect(idempotencyKeys[6]).toBe(idempotencyKeys[4]);
    expect(idempotencyKeys[7]).toBe(idempotencyKeys[5]);
  });

  it("fails closed for an address outside the published test ZIPs", () => {
    expect(quoteMockLocalDelivery(request("1 Times Sq", "10036"))).toEqual({
      eligible: false,
      source: "MOCK",
      reasonCode: "OUTSIDE_WALKING_AREA",
      message: "This address is outside the current walking delivery area."
    });
  });

  it("does not invent a route for an unverified address inside an eligible ZIP", () => {
    expect(quoteMockLocalDelivery(request("999 E 80th St", "10075"))).toMatchObject({
      eligible: false,
      reasonCode: "TEST_ADDRESS_UNAVAILABLE"
    });
  });

  it("rejects checkout until OrderPro returns an available delivery slot", async () => {
    const quote = quoteMockLocalDelivery(request("500 E 80th St", "10075"));
    expect(quote.eligible).toBe(true);
    if (!quote.eligible) return;

    await expect(validateOrderProLocalDeliverySelection({
      quoteId: quote.quoteId,
      slotId: "missing-orderpro-slot",
      feeCents: quote.feeCents,
      requestedDate: quote.requestedDate,
      address: quote.normalizedAddress,
      locationId: quote.selectedLocationId,
      cartLines: [{ squareVariationId: "variation-1", quantity: 1, source: "storefront" }]
    })).resolves.toEqual({
      valid: false,
      message: "The local delivery quote or time slot is no longer valid. Check the address again."
    });
  });

  it("accepts a fresh checkout quote id when location, fee, slot and expiry still match", () => {
    const preview = quoteMockLocalDelivery(request("316 E 82nd St", "10028"));
    expect(preview.eligible).toBe(true);
    if (!preview.eligible) return;
    const startsAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const slot = {
      id: "delivery-checkout-fresh-slot",
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 60 * 60_000).toISOString(),
      label: "10:00 AM–11:00 AM"
    };

    expect(isCurrentOrderProLocalDeliverySelection({
      slotId: slot.id,
      feeCents: preview.feeCents,
      locationId: preview.selectedLocationId
    }, {
      ...preview,
      quoteId: "fresh-checkout-quote-id",
      availableSlots: [slot],
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
    })).toBe(true);
    expect(preview.quoteId).not.toBe("fresh-checkout-quote-id");
  });
});

function request(line1: string, postalCode: string): LocalDeliveryQuoteRequest {
  return {
    context: "checkout",
    address: {
      line1,
      city: "New York",
      state: "NY",
      postalCode,
      country: "US"
    },
    requestedDate: earliestNewYorkDeliveryDate(),
    cartLines: [{ squareVariationId: "variation-1", quantity: 1 }]
  };
}
