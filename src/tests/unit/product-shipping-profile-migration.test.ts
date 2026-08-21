// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "prisma/migrations/20260821124500_product_shipping_profiles/migration.sql"
), "utf8");

describe("product shipping profile migration", () => {
  it("uses narrow security-definer routines without granting table mutation to runtime", () => {
    expect(migration.match(/SECURITY DEFINER/gu)).toHaveLength(2);
    expect(migration.match(/SET search_path = pg_catalog, public/gu)).toHaveLength(2);
    expect(migration).toContain("storefront_admin_save_product_shipping_profile_v1");
    expect(migration).toContain("storefront_read_product_shipping_profiles_v1");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION");
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]*"ProductOverride"[\s\S]*storefront_runtime/iu);
  });

  it("derives shipping eligibility and rejects unsafe package values in the database", () => {
    expect(migration).toContain("v_shipping_ready := COALESCE(p_web_visible");
    expect(migration).toContain("AND p_shipping_requested");
    expect(migration).toContain("AND p_is_shippable");
    expect(migration).toContain("INVALID_PRODUCT_PACKAGE_VALUE");
    expect(migration).toContain("value <= 0 OR value > 99999.999");
    expect(migration).toContain("ON CONFLICT (\"squareVariationId\") DO UPDATE");
  });
});
