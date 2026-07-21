import { describe, expect, it } from "vitest";
import type { LocalDeliveryQuoteRequest } from "@/features/fulfillment/contracts/orderpro-local-delivery";
import { earliestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";
import {
  checkMockBalloonPostalEligibility,
  checkOrderProBalloonPostalEligibility,
  quoteMockLocalDelivery,
  validateOrderProLocalDeliverySelection
} from "@/server/orderpro/orderpro-local-delivery-service";

describe("OrderPro local delivery test gateway", () => {
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
