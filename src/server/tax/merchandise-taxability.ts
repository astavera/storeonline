/** Resolves explicit Stripe Tax classifications from synchronized Square data. */

import "server-only";

import type { CartQuoteLine } from "@/server/checkout/cart-service";
import { env } from "@/lib/validation/env";
import type { ProductTaxProfile } from "@/server/square/postgres-catalog-store";
import type { TaxCalculationLine } from "@/server/tax/tax-types";

export class TaxClassificationUnavailableError extends Error {
  constructor(message = "One or more products do not have an approved tax classification.") {
    super(message);
    this.name = "TaxClassificationUnavailableError";
  }
}

export function buildTaxCalculationLines(
  lines: readonly CartQuoteLine[],
  profiles: readonly ProductTaxProfile[],
  defaultProductTaxCode = env.STRIPE_TAX_DEFAULT_PRODUCT_CODE
): TaxCalculationLine[] {
  const profilesByVariation = new Map(profiles.map((profile) => [profile.squareVariationId, profile]));
  return lines.map((line) => {
    const profile = profilesByVariation.get(line.squareVariationId);
    if (!profile || profile.squareIsTaxable === null) {
      throw new TaxClassificationUnavailableError(
        "Product taxability is not available from the latest Square catalog sync."
      );
    }

    const productTaxCode = profile.stripeTaxCode?.trim() || null;
    if (productTaxCode && !/^txcd_\d{8}$/.test(productTaxCode)) {
      throw new TaxClassificationUnavailableError("A product has an invalid Stripe Tax code.");
    }
    if (!profile.squareIsTaxable && !productTaxCode) {
      throw new TaxClassificationUnavailableError(
        "A Square non-taxable product needs an explicit Stripe Tax code before shipping checkout."
      );
    }
    const resolvedTaxCode = productTaxCode || defaultProductTaxCode?.trim() || null;
    if (!resolvedTaxCode || !/^txcd_\d{8}$/.test(resolvedTaxCode)) {
      throw new TaxClassificationUnavailableError(
        "A taxable product needs an approved default or product-specific Stripe Tax code."
      );
    }

    return {
      id: line.squareVariationId,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      discountCents: 0,
      taxability: { kind: "PRODUCT_TAX_CODE" as const, code: resolvedTaxCode }
    };
  });
}
