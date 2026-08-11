/**
 * Verifies the isolated behavior of brand GTIN import service.
 */

import { describe, expect, it } from "vitest";
import { canonicalizeGtin, prepareBrandGtinImport } from "@/features/catalog/services/brand-gtin-import-service";

describe("brand GTIN import service", () => {
  it("matches UPC, EAN and GTIN forms through one canonical value", () => {
    expect(canonicalizeGtin("123456789012")).toBe("00123456789012");
    expect(canonicalizeGtin("0 12345-67890 12")).toBe("00123456789012");
    expect(canonicalizeGtin("00123456789012")).toBe("00123456789012");
  });

  it("deduplicates equivalent codes and reports invalid rows", () => {
    const result = prepareBrandGtinImport([
      "123456789012",
      "00123456789012",
      "123456789012",
      "not-a-gtin",
      ""
    ]);

    expect(result.canonicalGtins).toEqual(["00123456789012"]);
    expect(result.duplicateCount).toBe(2);
    expect(result.invalidInputs).toEqual(["not-a-gtin"]);
    expect(result.nonEmptyInputCount).toBe(4);
  });

  it("rejects imports that exceed the configured unique-code limit", () => {
    expect(() => prepareBrandGtinImport(["12345670", "12345671"], 1)).toThrow("up to 1 unique GTINs");
  });
});
