/**
 * Resolves the physical shipping origin from the same private SHIPPO_ORIGIN_* inputs.
 */

import "server-only";

import { taxAddressSchema, type TaxAddress } from "@/server/tax/tax-types";
import { TaxProviderError } from "@/server/tax/tax-provider";
import { fingerprintTaxAddress } from "@/server/tax/tax-fingerprint";

export type ResolvedShippingTaxOrigin = Readonly<{
  source: "SHIPPO_ORIGIN";
  address: TaxAddress;
  fingerprint: string;
}>;

export function resolveShippingTaxOrigin(
  environment: Record<string, string | undefined> = process.env
): ResolvedShippingTaxOrigin {
  const country = environment.SHIPPO_ORIGIN_COUNTRY?.trim().toUpperCase() || "US";
  const candidate = {
    line1: environment.SHIPPO_ORIGIN_STREET1,
    ...(environment.SHIPPO_ORIGIN_STREET2?.trim()
      ? { line2: environment.SHIPPO_ORIGIN_STREET2 }
      : {}),
    city: environment.SHIPPO_ORIGIN_CITY,
    state: environment.SHIPPO_ORIGIN_STATE,
    postalCode: environment.SHIPPO_ORIGIN_ZIP,
    country
  };
  const parsed = taxAddressSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new TaxProviderError("TAX_PROVIDER_NOT_CONFIGURED");
  }
  return {
    source: "SHIPPO_ORIGIN",
    address: parsed.data,
    fingerprint: fingerprintTaxAddress(parsed.data)
  };
}
