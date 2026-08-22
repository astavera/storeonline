/** Recalculates a signed SHIPPING TaxQuote from authoritative server inputs. */

import "server-only";

import type { CartQuote } from "@/server/checkout/cart-service";
import { readPostgresProductTaxProfilesByVariationIds } from "@/server/square/postgres-catalog-store";
import type { SquareExplicitShippingTaxBreakdown } from "@/server/square/hosted-checkout";
import {
  fingerprintShippingRate,
  fingerprintTaxAddress,
  fingerprintTaxCalculationResult,
  fingerprintTaxCart
} from "@/server/tax/tax-fingerprint";
import { buildTaxCalculationLines } from "@/server/tax/merchandise-taxability";
import { resolveShippingTaxOrigin } from "@/server/tax/tax-origin-resolver";
import { TaxQuoteConflictError } from "@/server/tax/tax-quote-repository";
import { createConfiguredTaxQuoteTokenSigner, type TaxQuoteTokenPayload } from "@/server/tax/tax-quote-token";
import { createConfiguredShippingTaxService } from "@/server/tax/tax-service";
import { buildSquareExplicitShippingTaxBreakdown } from "@/server/tax/square-tax-adapter";
import type { TaxCalculationInput, TaxCalculationResult } from "@/server/tax/tax-types";

type VerifiedShippingSelection = {
  rateId: string;
  amountCents: number;
  carrier: string;
  serviceName: string;
  readyToShipDate: string;
  expiresAt: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
};

export type RevalidatedShippingTaxQuote = {
  token: TaxQuoteTokenPayload;
  calculation: TaxCalculationInput;
  result: TaxCalculationResult;
  explicitTaxBreakdown: SquareExplicitShippingTaxBreakdown;
};

export async function revalidateShippingTaxQuote(input: {
  token: string;
  quote: CartQuote;
  shipping: VerifiedShippingSelection;
  now?: Date;
}): Promise<RevalidatedShippingTaxQuote> {
  const now = input.now ?? new Date();
  const token = createConfiguredTaxQuoteTokenSigner().verify(input.token, now);
  const profiles = await readPostgresProductTaxProfilesByVariationIds(
    input.quote.lines.map((line) => line.squareVariationId)
  );
  const lines = buildTaxCalculationLines(input.quote.lines, profiles);
  const origin = resolveShippingTaxOrigin();
  const calculation: TaxCalculationInput = {
    fulfillmentType: "SHIPPING",
    currency: "USD",
    origin: origin.address,
    destination: input.shipping.address,
    shippingCents: input.shipping.amountCents,
    lines
  };
  const cartFingerprint = fingerprintTaxCart(lines);
  const destinationFingerprint = fingerprintTaxAddress(input.shipping.address);
  const shippingRateFingerprint = fingerprintShippingRate({
    rateId: input.shipping.rateId,
    amountCents: input.shipping.amountCents,
    currency: "USD",
    expiresAt: input.shipping.expiresAt
  });
  if (
    token.cartFingerprint !== cartFingerprint ||
    token.originFingerprint !== origin.fingerprint ||
    token.destinationFingerprint !== destinationFingerprint ||
    token.shippingRateFingerprint !== shippingRateFingerprint
  ) {
    throw new TaxQuoteConflictError("TAX_QUOTE_MISMATCH");
  }

  const result = await createConfiguredShippingTaxService().calculateShippingTax(calculation);
  const calculationFingerprint = fingerprintTaxCalculationResult(result);
  if (
    token.calculationFingerprint !== calculationFingerprint ||
    token.nexusDecision !== result.nexusDecision ||
    token.taxSource !== result.taxSource ||
    token.subtotalCents !== result.subtotalCents ||
    token.shippingCents !== result.shippingCents ||
    token.merchandiseTaxCents !== result.merchandiseTaxCents ||
    token.shippingTaxCents !== result.shippingTaxCents ||
    token.totalTaxCents !== result.totalTaxCents ||
    token.totalCents !== result.totalCents
  ) {
    throw new TaxQuoteConflictError("TAX_QUOTE_MISMATCH");
  }

  return {
    token,
    calculation,
    result,
    explicitTaxBreakdown: buildSquareExplicitShippingTaxBreakdown({
      taxQuoteId: token.taxQuoteId,
      quote: input.quote,
      result
    })
  };
}
