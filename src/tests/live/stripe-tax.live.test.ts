/** Opt-in Stripe Tax sandbox smoke test. Never runs in the default test suite. */

import { describe, expect, it } from "vitest";
import { createConfiguredShippingTaxService, type TaxCalculationInput } from "@/server/tax";

const secretKey = process.env.STRIPE_TAX_SECRET_KEY?.trim();
const runLiveTest = /^sk_test_[A-Za-z0-9_]{8,}$/.test(secretKey ?? "");

const input: TaxCalculationInput = {
  fulfillmentType: "SHIPPING",
  currency: "USD",
  // Public addresses used only to exercise Stripe's sandbox tax calculation.
  origin: {
    line1: "920 5th Ave",
    city: "Seattle",
    state: "WA",
    postalCode: "98104",
    country: "US"
  },
  destination: {
    line1: "920 Broad Street",
    city: "Newark",
    state: "NJ",
    postalCode: "07102",
    country: "US"
  },
  shippingCents: 500,
  lines: [{
    id: "stripe-sandbox-item",
    quantity: 1,
    unitPriceCents: 1_000,
    discountCents: 0,
    taxability: { kind: "PRODUCT_TAX_CODE", code: "txcd_99999999" }
  }]
};

describe.skipIf(!runLiveTest)("Stripe Tax sandbox", () => {
  it("calculates and reconciles destination tax including shipping", async () => {
    const result = await createConfiguredShippingTaxService({
      environment: {
        DESTINATION_TAX_ENABLED: "true",
        SQUARE_ENVIRONMENT: "sandbox",
        STRIPE_TAX_SECRET_KEY: secretKey,
        STRIPE_TAX_SHIPPING_CODE: "txcd_92010001"
      }
    }).calculateShippingTax(input);

    expect(result).toMatchObject({
      provider: "stripe_tax",
      nexusDecision: "COLLECT",
      taxSource: "destination",
      subtotalCents: 1_000,
      shippingCents: 500,
      totalCents: 1_500 + result.totalTaxCents,
      jurisdiction: { country: "US", state: "NJ" }
    });
    expect(result.providerQuoteId).toMatch(/^taxcalc_/);
    expect(result.merchandiseTaxCents).toBeGreaterThan(0);
    expect(result.shippingTaxCents).toBeGreaterThan(0);
    expect(result.totalTaxCents).toBe(
      result.merchandiseTaxCents + result.shippingTaxCents
    );
  });
});
