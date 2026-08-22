/**
 * Defines the provider boundary and stable, non-sensitive failure codes.
 */

import "server-only";

import type { TaxCalculationInput, TaxCalculationResult } from "@/server/tax/tax-types";

export interface TaxProvider {
  readonly name: "stripe_tax";
  calculate(input: TaxCalculationInput): Promise<TaxCalculationResult>;
}

export type TaxProviderErrorCode =
  | "TAX_PROVIDER_DISABLED"
  | "TAX_PROVIDER_NOT_CONFIGURED"
  | "TAX_INVALID_INPUT"
  | "TAX_UNSUPPORTED_TAXABILITY"
  | "TAX_AUTHENTICATION_FAILED"
  | "TAX_RATE_LIMITED"
  | "TAX_UPSTREAM_REJECTED"
  | "TAX_REQUEST_TIMEOUT"
  | "TAX_PROVIDER_UNAVAILABLE"
  | "TAX_PROVIDER_PROTOCOL_ERROR"
  | "TAX_PROVIDER_RECONCILIATION_FAILED";

const publicMessages: Record<TaxProviderErrorCode, string> = {
  TAX_PROVIDER_DISABLED: "Destination tax calculation is disabled.",
  TAX_PROVIDER_NOT_CONFIGURED: "Destination tax calculation is not configured.",
  TAX_INVALID_INPUT: "The tax calculation input is invalid.",
  TAX_UNSUPPORTED_TAXABILITY: "A line item does not have an approved tax classification.",
  TAX_AUTHENTICATION_FAILED: "The tax provider authentication failed.",
  TAX_RATE_LIMITED: "The tax provider is temporarily rate limited.",
  TAX_UPSTREAM_REJECTED: "The tax provider rejected the calculation request.",
  TAX_REQUEST_TIMEOUT: "The tax provider request timed out.",
  TAX_PROVIDER_UNAVAILABLE: "The tax provider is temporarily unavailable.",
  TAX_PROVIDER_PROTOCOL_ERROR: "The tax provider returned an invalid response.",
  TAX_PROVIDER_RECONCILIATION_FAILED: "The tax provider totals could not be reconciled."
};

export class TaxProviderError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: TaxProviderErrorCode,
    readonly status: number | null = null,
    options?: { cause?: unknown; retryable?: boolean }
  ) {
    super(publicMessages[code], options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "TaxProviderError";
    this.retryable = options?.retryable ?? [
      "TAX_RATE_LIMITED",
      "TAX_REQUEST_TIMEOUT",
      "TAX_PROVIDER_UNAVAILABLE"
    ].includes(code);
  }
}
