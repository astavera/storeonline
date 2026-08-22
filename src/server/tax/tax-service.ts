/**
 * Exposes the shipping-only tax use case without leaking provider details to routes.
 */

import "server-only";

import type { TaxProvider } from "@/server/tax/tax-provider";
import type { TaxCalculationInput, TaxCalculationResult } from "@/server/tax/tax-types";
import { createConfiguredStripeTaxProvider } from "@/server/tax/stripe-tax-provider";

export interface TaxService {
  calculateShippingTax(input: TaxCalculationInput): Promise<TaxCalculationResult>;
}

export function createTaxService(provider: TaxProvider): TaxService {
  return {
    calculateShippingTax(input) {
      return provider.calculate(input);
    }
  };
}

export function createConfiguredShippingTaxService(options?: {
  environment?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}) {
  return createTaxService(createConfiguredStripeTaxProvider(options));
}
