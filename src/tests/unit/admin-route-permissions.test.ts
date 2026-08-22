import { describe, expect, it } from "vitest";
import { adminPagePermission } from "@/config/admin-route-permissions";

describe("Admin page permission routing", () => {
  it.each([
    ["/admin", "dashboard:read"],
    ["/admin/products/variation-1", "catalog:read"],
    ["/admin/settings?area=locations", "store-settings:read"],
    ["/admin/users-roles", "users:read"],
    ["/admin/audit-log", "audit:read"],
    ["/admin/sync-status", "integrations:read"],
    ["/admin/customers", "customers:read"],
    ["/admin/promotions", "promotions:read"],
    ["/admin/analytics", "analytics:read"],
    ["/admin/media", "media:read"],
    ["/admin/fulfillment", "operations:read"]
  ])("maps %s to %s", (pathname, permission) => {
    expect(adminPagePermission(pathname.split("?")[0])).toBe(permission);
  });
});
