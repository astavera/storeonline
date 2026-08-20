/**
 * Verifies the isolated behavior of shipping service.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const shippingState = vi.hoisted(() => ({
  packageWeightLb: "0.50",
  policyAvailable: true
}));

vi.mock("@/lib/validation/env", () => ({
  env: {
    SHIPPO_API_TOKEN: "shippo_test_token-that-is-not-real",
    SHIPPO_TEST_MODE: "true",
    SHIPPO_ALLOWED_CARRIERS: "usps",
    SHIPPO_ORIGIN_NAME: "Sebastian",
    SHIPPO_ORIGIN_COMPANY: "State News",
    SHIPPO_ORIGIN_STREET1: "153 South Dean Street",
    SHIPPO_ORIGIN_CITY: "Englewood",
    SHIPPO_ORIGIN_STATE: "NJ",
    SHIPPO_ORIGIN_ZIP: "07631",
    SHIPPO_ORIGIN_PHONE: "+12017508303",
    SHIPPO_ORIGIN_EMAIL: "sebastian@statenewsnyc.com"
  }
}));

vi.mock("@/server/checkout/cart-service", () => ({
  quoteCartWithProducts: () => ({
    lines: [{ squareVariationId: "variation-a", quantity: 1 }],
    errors: [],
    compatibleFulfillmentModes: ["shipping"]
  })
}));

vi.mock("@/server/square/postgres-catalog-store", () => ({
  readMappedOperationalStoreLocations: async () => [{
    id: "store-3rd-avenue",
    name: "3rd Avenue Store",
    address: "1243 3rd Ave",
    squareLocationId: "square-st72",
    pickupEnabled: true,
    localDeliveryEnabled: true,
    shippingFulfillmentEnabled: true
  }],
  readPostgresInventorySyncSummary: async () => ({
    available: true,
    lastCompletedAt: new Date().toISOString(),
    latestTime: new Date().toISOString()
  }),
  readPostgresStorefrontProductsByVariationIds: async () => [{
    squareVariationId: "variation-a",
    fulfillmentModes: [],
    inventoryTracked: true,
    availableQuantity: 1
  }],
  readPublishedStorefrontShippingPoliciesByVariationIds: async () => shippingState.policyAvailable ? [{
    squareVariationId: "variation-a",
    packageLengthIn: "10",
    packageWidthIn: "5",
    packageHeightIn: "6",
    packageWeightLb: shippingState.packageWeightLb
  }] : []
}));

const allocation = {
  ok: true as const,
  available: true as const,
  policyVersion: "shipping-st72-wh01.v1",
  sellingLocationId: "store-3rd-avenue",
  fulfillmentNodeId: "warehouse-englewood" as const,
  requiresStoreTransfer: true,
  transferLeadTimeDays: 2 as const,
  readyToShipDate: "2026-07-27",
  items: [{
    squareVariationId: "variation-a",
    quantity: 1,
    ownerLocationId: "store-3rd-avenue",
    physicalLocationId: "store-3rd-avenue",
    pickLocation: "CANARY-LD-01",
    requiresTransfer: true
  }]
};

vi.mock("@/server/orderpro/shipping-order-client", () => ({
  orderProShippingCommandIdentity: () => "shipping-quote:v1:test-identity",
  getOrderProShippingOrderClient: () => ({
    quote: async () => allocation
  })
}));

describe("OrderPRO and Shippo shipping service", () => {
  beforeEach(() => {
    vi.stubEnv("ORDERPRO_SHIPPING_CHECKOUT_ENABLED", "true");
    shippingState.packageWeightLb = "0.50";
    shippingState.policyAvailable = true;
  });

  it("signs a live rate and revalidates the same Shippo rate before checkout", async () => {
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/carrier_accounts")) {
        return Response.json([{ object_id: "carrier-usps-1", carrier: "usps", active: true, test: true }]);
      }
      if (url.endsWith("/shipments/")) {
        return Response.json({
          object_id: "shipment-1",
          status: "SUCCESS",
          test: true,
          rates: [{
            object_id: "rate-usps-ground-1",
            amount: "5.58",
            currency: "USD",
            provider: "USPS",
            test: true,
            estimated_days: 2,
            duration_terms: "Delivery in 2 to 5 business days",
            servicelevel: { name: "Ground Advantage", token: "usps_ground_advantage" }
          }]
        }, { status: 201 });
      }
      if (url.includes("/rates/rate-usps-ground-1")) {
        return Response.json({
          object_id: "rate-usps-ground-1",
          amount: "5.58",
          currency: "USD",
          provider: "USPS",
          test: true,
          estimated_days: 2,
          servicelevel: { name: "Ground Advantage", token: "usps_ground_advantage" }
        });
      }
      return new Response("not found", { status: 404 });
    });
    const { quoteShippingRates, validateShippingSelection } = await import("@/server/shipping/shipping-service");
    const address = {
      line1: "500 E 80th St",
      city: "New York",
      state: "NY",
      postalCode: "10075",
      country: "US" as const
    };
    const items = [{ squareVariationId: "variation-a", quantity: 1 }];
    const quoted = await quoteShippingRates({
      items,
      locationId: "store-3rd-avenue",
      address,
      fetchImpl: fakeFetch as typeof fetch,
      now: new Date("2026-07-23T17:00:00.000Z")
    });
    expect(quoted.rates[0]).toMatchObject({
      amountCents: 558,
      carrier: "USPS",
      serviceName: "Ground Advantage",
      readyToShipDate: "2026-07-27"
    });
    expect(quoted.rates[0].quoteToken).not.toContain("shippo_test");

    const verified = await validateShippingSelection({
      items,
      locationId: "store-3rd-avenue",
      selection: {
        quoteToken: quoted.rates[0].quoteToken,
        rateId: quoted.rates[0].rateId,
        amountCents: quoted.rates[0].amountCents,
        carrier: quoted.rates[0].carrier,
        serviceName: quoted.rates[0].serviceName,
        readyToShipDate: quoted.rates[0].readyToShipDate,
        address
      },
      fetchImpl: fakeFetch as typeof fetch,
      now: new Date("2026-07-23T17:05:00.000Z")
    });

    expect(verified).toMatchObject({ amountCents: 558, carrier: "USPS" });
    expect(calls.some((url) => url.includes("/rates/rate-usps-ground-1"))).toBe(true);
    expect(calls.every((url) => !url.includes("/transactions"))).toBe(true);
  });

  it("rejects a rate if the client changes the amount", async () => {
    const { validateShippingSelection, ShippingUnavailableError } = await import("@/server/shipping/shipping-service");
    await expect(validateShippingSelection({
      items: [{ squareVariationId: "variation-a", quantity: 1 }],
      locationId: "store-3rd-avenue",
      selection: {
        quoteToken: `${"a".repeat(48)}.invalid-signature`,
        rateId: "rate-usps-ground-1",
        amountCents: 1,
        carrier: "USPS",
        serviceName: "Ground Advantage",
        readyToShipDate: "2026-07-27",
        address: {
          line1: "500 E 80th St",
          city: "New York",
          state: "NY",
          postalCode: "10075",
          country: "US"
        }
      }
    })).rejects.toBeInstanceOf(ShippingUnavailableError);
  });

  it("rejects products without a published shipping policy before calling Shippo", async () => {
    shippingState.policyAvailable = false;
    const fetchMock = vi.fn();
    const { quoteShippingRates, ShippingUnavailableError } = await import("@/server/shipping/shipping-service");

    await expect(quoteShippingRates({
      items: [{ squareVariationId: "variation-a", quantity: 1 }],
      locationId: "store-3rd-avenue",
      address: {
        line1: "500 E 80th St",
        city: "New York",
        state: "NY",
        postalCode: "10075",
        country: "US"
      },
      fetchImpl: fetchMock as typeof fetch
    })).rejects.toBeInstanceOf(ShippingUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalidates a signed rate when authoritative package metadata changes", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/carrier_accounts")) {
        return Response.json([{ object_id: "carrier-usps-1", carrier: "usps", active: true, test: true }]);
      }
      if (url.endsWith("/shipments/")) {
        return Response.json({
          object_id: "shipment-1",
          status: "SUCCESS",
          test: true,
          rates: [{
            object_id: "rate-usps-ground-1",
            amount: "5.58",
            currency: "USD",
            provider: "USPS",
            test: true,
            servicelevel: { name: "Ground Advantage" }
          }]
        }, { status: 201 });
      }
      return Response.json({
        object_id: "rate-usps-ground-1",
        amount: "5.58",
        currency: "USD",
        provider: "USPS",
        test: true,
        servicelevel: { name: "Ground Advantage" }
      });
    });
    const { quoteShippingRates, validateShippingSelection, ShippingUnavailableError } = await import("@/server/shipping/shipping-service");
    const address = {
      line1: "500 E 80th St",
      city: "New York",
      state: "NY",
      postalCode: "10075",
      country: "US" as const
    };
    const items = [{ squareVariationId: "variation-a", quantity: 1 }];
    const quoted = await quoteShippingRates({
      items,
      locationId: "store-3rd-avenue",
      address,
      fetchImpl: fetchMock as typeof fetch,
      now: new Date("2026-07-23T17:00:00.000Z")
    });

    shippingState.packageWeightLb = "0.75";
    await expect(validateShippingSelection({
      items,
      locationId: "store-3rd-avenue",
      selection: {
        quoteToken: quoted.rates[0].quoteToken,
        rateId: quoted.rates[0].rateId,
        amountCents: quoted.rates[0].amountCents,
        carrier: quoted.rates[0].carrier,
        serviceName: quoted.rates[0].serviceName,
        readyToShipDate: quoted.rates[0].readyToShipDate,
        address
      },
      fetchImpl: fetchMock as typeof fetch,
      now: new Date("2026-07-23T17:05:00.000Z")
    })).rejects.toBeInstanceOf(ShippingUnavailableError);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/rates/"))).toHaveLength(0);
  });

  it("rejects live Shippo objects while configured for test mode", async () => {
    const fetchMock = vi.fn(async () => Response.json([
      { object_id: "carrier-usps-live", carrier: "usps", active: true, test: false }
    ]));
    const { quoteShippingRates, ShippingUnavailableError } = await import("@/server/shipping/shipping-service");

    await expect(quoteShippingRates({
      items: [{ squareVariationId: "variation-a", quantity: 1 }],
      locationId: "store-3rd-avenue",
      address: {
        line1: "500 E 80th St",
        city: "New York",
        state: "NY",
        postalCode: "10075",
        country: "US"
      },
      fetchImpl: fetchMock as typeof fetch
    })).rejects.toBeInstanceOf(ShippingUnavailableError);
  });
});
