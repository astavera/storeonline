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
      slotId: "missing-slot"
    })).resolves.toMatchObject({ valid: false });
  });

  it("reads production pickup slots from the private OrderPRO connection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDERPRO_STOREFRONT_PREVIEW_BASE_URL", "http://orderpro:3000");
    vi.stubEnv("ORDERPRO_STOREFRONT_PREVIEW_SHARED_SECRET", "test-orderpro-preview-key-that-is-long-enough");
    const requestedDate = earliestNewYorkDeliveryDate();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true,
      mode: "PICKUP",
      locationId: "east_86th_street",
      requestedDate,
      expiresAt: "2026-07-23T18:05:00.000Z",
      availableSlots: [{
        slotId: "pickup-east_86th_street-slot-1",
        startsAt: "2026-07-24T14:00:00.000Z",
        endsAt: "2026-07-24T15:00:00.000Z"
      }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const availability = await getOrderProPickupAvailability({
      locationId: "store-86th-street",
      requestedDate
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://orderpro:3000/api/staging/pickup/slots-preview");
  });
});
