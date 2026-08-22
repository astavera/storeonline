/**
 * Verifies the isolated behavior of admin return to.
 */

import { describe, expect, it } from "vitest";
import { getSafeInternalRedirect, safeAdminReturnTo } from "@/lib/security/admin-return-to";

describe("safeAdminReturnTo", () => {
  it.each([
    undefined,
    "",
    "https://evil.example/admin",
    "http://evil.example/admin",
    "//evil.example/admin",
    "javascript:alert(1)",
    "/shop",
    "/admin/login",
    "/admin/login?next=/admin",
    "/admin\\\\evil.example",
    "%2F%2Fevil.example",
    "%252F%252Fevil.example",
    "/admin/%2e%2e/%2e%2e//evil.example",
    "/admin/%252e%252e/%252e%252e//evil.example"
  ])(
    "rejects unsafe or recursive return target %s",
    (value) => {
      expect(safeAdminReturnTo(value)).toBe("/admin");
    }
  );

  it("allows internal admin paths and query strings", () => {
    expect(getSafeInternalRedirect("/admin")).toBe("/admin");
    expect(getSafeInternalRedirect("/admin/products")).toBe("/admin/products");
    expect(safeAdminReturnTo("/admin/products?page=2")).toBe("/admin/products?page=2");
  });
});
