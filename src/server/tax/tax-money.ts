/** Exact, provider-neutral money helpers. */

import "server-only";

import { MAX_MONEY_CENTS } from "@/server/tax/tax-types";
import { TaxProviderError } from "@/server/tax/tax-provider";

function decimalToScaledInteger(value: number | string, scale: number, maximum: number) {
  const lexical = typeof value === "number" ? String(value) : value.trim();
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
    throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR");
  }
  const match = /^(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(lexical);
  if (!match) throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR");

  const integer = match[1];
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
    throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR");
  }

  const digits = BigInt(`${integer}${fraction}` || "0");
  const power = exponent - fraction.length + scale;
  let scaled: bigint;
  if (power >= 0) {
    scaled = digits * (10n ** BigInt(power));
  } else {
    const divisor = 10n ** BigInt(-power);
    if (digits % divisor !== 0n) {
      throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR");
    }
    scaled = digits / divisor;
  }

  if (scaled > BigInt(maximum)) throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR");
  return Number(scaled);
}

/** Converts a Stripe percentage string (for example 8.875) to parts per million. */
export function percentageDecimalToPpm(value: number | string) {
  return decimalToScaledInteger(value, 4, 1_000_000);
}

export function safeAddCents(...values: number[]) {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new TaxProviderError("TAX_INVALID_INPUT");
    return sum + BigInt(value);
  }, 0n);
  if (total > BigInt(MAX_MONEY_CENTS)) throw new TaxProviderError("TAX_INVALID_INPUT");
  return Number(total);
}

export function safeLineNetCents(unitPriceCents: number, quantity: number, discountCents: number) {
  if (
    !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 ||
    !Number.isSafeInteger(quantity) || quantity <= 0 ||
    !Number.isSafeInteger(discountCents) || discountCents < 0
  ) {
    throw new TaxProviderError("TAX_INVALID_INPUT");
  }
  const result = BigInt(unitPriceCents) * BigInt(quantity) - BigInt(discountCents);
  if (result < 0n || result > BigInt(MAX_MONEY_CENTS)) {
    throw new TaxProviderError("TAX_INVALID_INPUT");
  }
  return Number(result);
}
