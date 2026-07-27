import { describe, expect, it } from "vitest";
import { safeAdminReturnTo } from "@/lib/security/admin-return-to";

describe("safeAdminReturnTo", () => {
  it.each([undefined, "", "https://evil.example/admin", "//evil.example/admin", "/shop", "/admin/login", "/admin/login?next=/admin"])(
    "rejects unsafe or recursive return target %s",
    (value) => {
      expect(safeAdminReturnTo(value)).toBe("/admin");
    }
  );

  it("allows internal admin paths and query strings", () => {
    expect(safeAdminReturnTo("/admin/products?page=2")).toBe("/admin/products?page=2");
  });
});
