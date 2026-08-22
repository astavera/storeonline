/** Maps exact Stripe Tax cents to Square percentage taxes used only for SHIPPING. */

import "server-only";

import type { CartQuote } from "@/server/checkout/cart-service";
import type { SquareExplicitShippingTaxBreakdown } from "@/server/square/hosted-checkout";
import type { TaxCalculationResult } from "@/server/tax/tax-types";

export class SquareTaxMappingError extends Error {
  constructor(message = "The destination tax cannot be represented exactly in Square.") {
    super(message);
    this.name = "SquareTaxMappingError";
  }
}

export function buildSquareExplicitShippingTaxBreakdown(input: {
  taxQuoteId: string;
  quote: CartQuote;
  result: TaxCalculationResult;
}): SquareExplicitShippingTaxBreakdown {
  const resultById = new Map(input.result.lines.map((line) => [line.id, line]));
  const merchandiseLines = input.quote.lines.map((line) => {
    const taxLine = resultById.get(line.squareVariationId);
    if (!taxLine) throw new SquareTaxMappingError("Stripe Tax omitted a verified merchandise line.");
    return {
      squareVariationId: line.squareVariationId,
      ratePpm: findExactSquareRatePpm(line.lineTotalCents, taxLine.taxCents, taxLine.combinedRatePpm),
      taxCents: taxLine.taxCents
    };
  });
  if (merchandiseLines.length !== input.result.lines.length) {
    throw new SquareTaxMappingError("Stripe Tax returned an unexpected merchandise line.");
  }

  const shippingRatePpm = findExactSquareRatePpm(
    input.result.shippingCents,
    input.result.shippingTaxCents,
    input.result.shippingCombinedRatePpm
  );
  const totalTaxCents = merchandiseLines.reduce((total, line) => total + line.taxCents, 0)
    + input.result.shippingTaxCents;
  if (totalTaxCents !== input.result.totalTaxCents) {
    throw new SquareTaxMappingError("The Stripe Tax line breakdown does not reconcile.");
  }

  return {
    taxQuoteId: input.taxQuoteId,
    taxName: input.result.jurisdiction?.state
      ? `${input.result.jurisdiction.state} destination sales tax`
      : "Destination sales tax",
    merchandiseLines,
    shipping: {
      ratePpm: shippingRatePpm,
      taxCents: input.result.shippingTaxCents
    },
    totalTaxCents
  };
}

/**
 * Finds an integer parts-per-million rate whose banker's-rounded result equals
 * the provider's exact cents. CalculateOrder remains the final proof.
 */
export function findExactSquareRatePpm(baseCents: number, taxCents: number, preferredRatePpm = 0) {
  assertCents(baseCents);
  assertCents(taxCents);
  if (taxCents === 0) return 0;
  if (baseCents === 0 || taxCents > baseCents) throw new SquareTaxMappingError();

  const center = Math.round((taxCents * 1_000_000) / baseCents);
  const candidates = new Set<number>([preferredRatePpm, center]);
  for (let offset = 1; offset <= 2_000; offset += 1) {
    candidates.add(center - offset);
    candidates.add(center + offset);
  }
  for (const ratePpm of candidates) {
    if (
      Number.isSafeInteger(ratePpm) &&
      ratePpm >= 0 &&
      ratePpm <= 1_000_000 &&
      bankersRoundFraction(BigInt(baseCents) * BigInt(ratePpm), 1_000_000n) === taxCents
    ) {
      return ratePpm;
    }
  }
  throw new SquareTaxMappingError();
}

function bankersRoundFraction(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubledRemainder = remainder * 2n;
  const rounded = doubledRemainder < denominator
    ? quotient
    : doubledRemainder > denominator
      ? quotient + 1n
      : quotient % 2n === 0n
        ? quotient
        : quotient + 1n;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new SquareTaxMappingError();
  return Number(rounded);
}

function assertCents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new SquareTaxMappingError();
}
