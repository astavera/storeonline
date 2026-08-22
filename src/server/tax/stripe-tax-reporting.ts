/** Commits a completed external Square payment to Stripe Tax exactly once. */

import "server-only";

import { createStripeTaxClient, resolveStripeTaxConfiguration } from "@/server/tax/stripe-tax-client";
import type { TaxQuoteRecord } from "@/server/tax/tax-quote-repository";
import { TaxProviderError } from "@/server/tax/tax-provider";

export async function reportCompletedSquareSaleToStripeTax(input: {
  quote: TaxQuoteRecord;
  squareOrderId: string;
  paidAt: string;
  environment?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}) {
  const environment = input.environment ?? process.env;
  if (environment.STRIPE_TAX_REPORTING_ENABLED?.trim() !== "true") {
    throw new TaxProviderError("TAX_PROVIDER_DISABLED");
  }
  if (input.quote.providerTransactionId) {
    return { id: input.quote.providerTransactionId, alreadyReported: true };
  }
  const configuration = resolveStripeTaxConfiguration(environment);
  const paidAt = Date.parse(input.paidAt);
  if (!Number.isFinite(paidAt) || paidAt > Date.now() + 60_000) {
    throw new TaxProviderError("TAX_INVALID_INPUT");
  }
  const transaction = await createStripeTaxClient({
    configuration,
    fetchImpl: input.fetchImpl
  }).createTransactionFromCalculation({
    calculationId: input.quote.providerQuoteId,
    reference: input.squareOrderId,
    postedAt: Math.floor(paidAt / 1_000)
  });
  return { id: transaction.id, alreadyReported: false };
}
