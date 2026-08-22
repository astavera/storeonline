/**
 * Verifies exact provider-boundary conversions and private origin resolution.
 */

import { describe, expect, it } from "vitest";
import {
  fingerprintTaxAddress,
  fingerprintTaxCart,
  percentageDecimalToPpm,
  resolveShippingTaxOrigin,
} from "@/server/tax";

const validOriginEnvironment = {
  SHIPPO_ORIGIN_STREET1: " 153 S Dean St ",
  SHIPPO_ORIGIN_CITY: " Englewood ",
  SHIPPO_ORIGIN_STATE: "nj",
  SHIPPO_ORIGIN_ZIP: "07631"
};

describe("tax money and origin boundaries", () => {
  it("converts Stripe percentage strings without floating-point rounding", () => {
    expect(percentageDecimalToPpm("8.875")).toBe(88_750);
    expect(percentageDecimalToPpm("0.01")).toBe(100);
  });

  it("resolves and fingerprints the same physical origin used by Shippo", () => {
    const origin = resolveShippingTaxOrigin(validOriginEnvironment);
    expect(origin).toMatchObject({
      source: "SHIPPO_ORIGIN",
      address: {
        line1: "153 S Dean St",
        city: "Englewood",
        state: "NJ",
        postalCode: "07631",
        country: "US"
      }
    });
    expect(origin.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(origin.fingerprint).toBe(fingerprintTaxAddress({
      line1: "153   s dean st",
      city: "ENGLEWOOD",
      state: "NJ",
      postalCode: "07631",
      country: "US"
    }));
  });

  it("fails closed when the Shippo origin is incomplete or outside the US", () => {
    expect(() => resolveShippingTaxOrigin({})).toThrowError(
      expect.objectContaining({ code: "TAX_PROVIDER_NOT_CONFIGURED" })
    );
    expect(() => resolveShippingTaxOrigin({
      ...validOriginEnvironment,
      SHIPPO_ORIGIN_COUNTRY: "CA"
    })).toThrowError(expect.objectContaining({ code: "TAX_PROVIDER_NOT_CONFIGURED" }));
  });

  it("produces an order-independent cart fingerprint including taxability", () => {
    const first = {
      id: "variation-a",
      quantity: 2,
      unitPriceCents: 1_000,
      discountCents: 100,
      taxability: { kind: "PRODUCT_TAX_CODE" as const, code: "txcd_99999999" }
    };
    const second = {
      id: "variation-b",
      quantity: 1,
      unitPriceCents: 500,
      discountCents: 0,
      taxability: { kind: "PRODUCT_TAX_CODE" as const, code: "txcd_00000000" }
    };
    expect(fingerprintTaxCart([first, second])).toBe(fingerprintTaxCart([second, first]));
    expect(fingerprintTaxCart([first, second])).not.toBe(fingerprintTaxCart([
      first,
      { ...second, taxability: { kind: "PRODUCT_TAX_CODE" as const, code: "txcd_99999999" } }
    ]));
  });
});
