/**
 * Implements the brand GTIN import service workflow for the catalog feature.
 */

export type PreparedBrandGtinImport = {
  canonicalGtins: string[];
  duplicateCount: number;
  inputByCanonicalGtin: Record<string, string>;
  invalidInputs: string[];
  nonEmptyInputCount: number;
};

export function prepareBrandGtinImport(values: string[], maximumUniqueGtins = 25_000): PreparedBrandGtinImport {
  const canonicalGtins: string[] = [];
  const inputByCanonicalGtin: Record<string, string> = {};
  const invalidInputs: string[] = [];
  let duplicateCount = 0;
  let nonEmptyInputCount = 0;

  for (const rawValue of values) {
    const input = rawValue.trim();
    if (!input) continue;
    nonEmptyInputCount += 1;

    const canonicalGtin = canonicalizeGtin(input);
    if (!canonicalGtin) {
      invalidInputs.push(input);
      continue;
    }
    if (inputByCanonicalGtin[canonicalGtin]) {
      duplicateCount += 1;
      continue;
    }
    if (canonicalGtins.length >= maximumUniqueGtins) {
      throw new Error(`A single Brand CSV can contain up to ${maximumUniqueGtins.toLocaleString("en-US")} unique GTINs.`);
    }

    canonicalGtins.push(canonicalGtin);
    inputByCanonicalGtin[canonicalGtin] = input;
  }

  return { canonicalGtins, duplicateCount, inputByCanonicalGtin, invalidInputs, nonEmptyInputCount };
}

export function canonicalizeGtin(value: string): string | null {
  const digits = value.trim().replace(/[\s-]+/g, "");
  if (!/^\d{8,14}$/.test(digits)) return null;
  return digits.padStart(14, "0");
}
