import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalDeliveryQuoteRequest } from "@/features/fulfillment/contracts/orderpro-local-delivery";
import { earliestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";
import {
  checkMockBalloonPostalEligibility,
  checkOrderProBalloonPostalEligibility,
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

  it("maps a production OrderPRO preview quote without enabling checkout", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDERPRO_STOREFRONT_PREVIEW_BASE_URL", "http://orderpro:3000");
    vi.stubEnv("ORDERPRO_STOREFRONT_PREVIEW_SHARED_SECRET", "test-orderpro-preview-key-that-is-long-enough");
    const requestedDate = earliestNewYorkDeliveryDate();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true,
      eligible: true,
      bookable: true,
      reasonCode: "ELIGIBLE",
      normalizedAddress: {
        line1: "500 EAST 80 STREET",
        line2: null,
        city: "New York",
        state: "NY",
        postalCode: "10075",
        country: "US"
      },
      selectedLocationId: "third_avenue",
      selectedLocationName: "3rd Avenue Store",
      walkingDistanceFeet: 4261,
      walkingDurationSeconds: 1020,
      feeCents: 2500,
      currency: "USD",
      availableSlots: [{
        slotId: "delivery-third_avenue-slot-1",
        startsAt: "2026-07-24T21:30:00.000Z",
        endsAt: "2026-07-24T22:30:00.000Z"
      }],
      candidateRoutes: [{
        locationId: "third_avenue",
        walkingDistanceFeet: 4261,
        walkingDurationSeconds: 1020
      }, {
        locationId: "east_86th_street",
        walkingDistanceFeet: 4800,
        walkingDurationSeconds: 1200
      }],
      expiresAt: "2026-07-23T18:05:00.000Z"
    }), { status: 200, headers: { "content-type": "application/json" } })));

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
      locationId: quote.selectedLocationId
    })).resolves.toMatchObject({ valid: false });
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
    requestedDate: earliestNewYorkDeliveryDate()
  };
}
