/**
 * Produces deterministic, one-way bindings for tax inputs without putting PII in tokens.
 */

import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  taxAddressSchema,
  taxCalculationLineSchema,
  type TaxAddress,
  type TaxCalculationLine,
  type TaxCalculationResult
} from "@/server/tax/tax-types";

const shippingRateBindingSchema = z.object({
  rateId: z.string().trim().min(1).max(200),
  amountCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  expiresAt: z.string().datetime()
}).strict();

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function canonicalText(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function fingerprintTaxAddress(value: TaxAddress) {
  const address = taxAddressSchema.parse(value);
  return sha256(JSON.stringify({
    line1: canonicalText(address.line1),
    line2: canonicalText(address.line2),
    city: canonicalText(address.city),
    state: address.state,
    postalCode: address.postalCode,
    country: address.country
  }));
}

export function fingerprintTaxCart(value: readonly TaxCalculationLine[]) {
  const lines = value.map((line) => taxCalculationLineSchema.parse(line));
  return sha256(JSON.stringify(lines
    .map((line) => ({
      id: line.id,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      discountCents: line.discountCents,
      taxability: line.taxability
    }))
    .sort((left, right) => left.id.localeCompare(right.id))));
}

export function fingerprintShippingRate(value: z.input<typeof shippingRateBindingSchema>) {
  return sha256(JSON.stringify(shippingRateBindingSchema.parse(value)));
}

export function fingerprintTaxCalculationResult(value: TaxCalculationResult) {
  return sha256(JSON.stringify({
    provider: value.provider,
    fulfillmentType: value.fulfillmentType,
    applicationMode: value.applicationMode,
    currency: value.currency,
    nexusDecision: value.nexusDecision,
    taxSource: value.taxSource,
    jurisdiction: value.jurisdiction,
    freightTaxable: value.freightTaxable,
    subtotalCents: value.subtotalCents,
    shippingCents: value.shippingCents,
    taxableMerchandiseCents: value.taxableMerchandiseCents,
    taxableShippingCents: value.taxableShippingCents,
    merchandiseTaxCents: value.merchandiseTaxCents,
    shippingTaxCents: value.shippingTaxCents,
    totalTaxCents: value.totalTaxCents,
    totalCents: value.totalCents,
    combinedRatePpm: value.combinedRatePpm,
    shippingCombinedRatePpm: value.shippingCombinedRatePpm,
    lines: [...value.lines].sort((left, right) => left.id.localeCompare(right.id))
  }));
}
