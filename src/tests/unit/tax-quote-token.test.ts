/**
 * Verifies TaxQuote HMAC integrity, expiry, and secret separation.
 */

import { describe, expect, it } from "vitest";
import {
  createTaxQuoteTokenSigner,
  resolveTaxQuoteSigningSecret,
  TaxProviderError,
  TaxQuoteTokenError,
  type TaxQuoteTokenPayload
} from "@/server/tax";

const secret = "tax-quote-test-secret-that-is-at-least-32-bytes";
const payload: TaxQuoteTokenPayload = {
  v: 1,
  purpose: "shipping-tax-quote",
  taxQuoteId: "taxquote_12345678",
  provider: "stripe_tax",
  fulfillmentType: "SHIPPING",
  applicationMode: "EXPLICIT_DESTINATION_TAX",
  currency: "USD",
  nexusDecision: "COLLECT",
  taxSource: "destination",
  cartFingerprint: "a".repeat(64),
  originFingerprint: "b".repeat(64),
  destinationFingerprint: "c".repeat(64),
  shippingRateFingerprint: "d".repeat(64),
  calculationFingerprint: "e".repeat(64),
  subtotalCents: 1_000,
  shippingCents: 500,
  merchandiseTaxCents: 80,
  shippingTaxCents: 40,
  totalTaxCents: 120,
  totalCents: 1_620,
  issuedAt: "2026-08-21T20:00:00.000Z",
  expiresAt: "2026-08-21T20:10:00.000Z"
};

describe("TaxQuote token", () => {
  it("round-trips an authenticated, short-lived payload", () => {
    const signer = createTaxQuoteTokenSigner(secret);
    const token = signer.sign(payload);
    expect(token).not.toContain("taxquote_12345678");
    expect(signer.verify(token, new Date("2026-08-21T20:05:00.000Z"))).toEqual(payload);
  });

  it("rejects tampering, a different key, and expiry", () => {
    const signer = createTaxQuoteTokenSigner(secret);
    const token = signer.sign(payload);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(() => signer.verify(tampered, new Date("2026-08-21T20:05:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "TAX_QUOTE_TOKEN_INVALID" }));
    expect(() => createTaxQuoteTokenSigner(`${secret}-different`).verify(
      token,
      new Date("2026-08-21T20:05:00.000Z")
    )).toThrow(TaxQuoteTokenError);
    expect(() => signer.verify(token, new Date("2026-08-21T20:10:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "TAX_QUOTE_TOKEN_EXPIRED" }));
  });

  it("rejects inconsistent totals and excessive TTL", () => {
    const signer = createTaxQuoteTokenSigner(secret);
    expect(() => signer.sign({ ...payload, totalCents: 1_621 })).toThrow(TaxQuoteTokenError);
    expect(() => signer.sign({
      ...payload,
      expiresAt: "2026-08-21T20:16:00.000Z"
    })).toThrow(TaxQuoteTokenError);
  });

  it("requires a dedicated secret distinct from provider credentials", () => {
    expect(() => resolveTaxQuoteSigningSecret({
      TAX_QUOTE_SIGNING_SECRET: secret,
      STRIPE_TAX_SECRET_KEY: secret
    })).toThrow(TaxProviderError);
    expect(() => resolveTaxQuoteSigningSecret({
      TAX_QUOTE_SIGNING_SECRET: "short"
    })).toThrow(TaxProviderError);
    expect(resolveTaxQuoteSigningSecret({ TAX_QUOTE_SIGNING_SECRET: secret })).toBe(secret);
  });
});
