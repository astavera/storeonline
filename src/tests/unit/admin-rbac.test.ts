/** Verifies the pure Store Admin role and permission policy. */

import { describe, expect, it } from "vitest";
import {
  adminPermissions,
  adminRoles,
  authorizeAdminAccess,
  canAssignAdminRole,
  externalAuthorityBoundaries,
  forbiddenRoleCapabilities,
  isAdminPermission,
  isAdminRole,
  permissionsForRole,
  roleHasPermission,
  roleSessionCapabilities,
  type AdminPrincipal,
  type AdminRole
} from "@/server/admin/identity";

function principal(overrides: Partial<AdminPrincipal> = {}): AdminPrincipal {
  return {
    id: "admin-1",
    role: "OWNER",
    status: "ACTIVE",
    mfaVerified: true,
    locationScope: { kind: "ALL" },
    ...overrides
  };
}

describe("Store Admin RBAC", () => {
  it("defines only the six approved Store Admin roles", () => {
    expect(adminRoles).toEqual([
      "OWNER",
      "MANAGER",
      "MERCHANDISER",
      "MARKETING_CONTENT",
      "CUSTOMER_SUPPORT",
      "ANALYST_VIEWER"
    ]);
    expect(isAdminRole("STORE_STAFF")).toBe(false);
    expect(isAdminRole("DELIVERY_STAFF")).toBe(false);
  });

  it("never emits a wildcard or an externally owned mutation for any role", () => {
    for (const role of adminRoles) {
      const capabilities = roleSessionCapabilities(role);
      expect(capabilities).not.toContain("admin:*");
      for (const forbidden of forbiddenRoleCapabilities) {
        expect(capabilities).not.toContain(forbidden);
      }
      expect(capabilities.every(isAdminPermission)).toBe(true);
    }

    expect(externalAuthorityBoundaries.SQUARE.owns).toContain("refund-execution");
    expect(externalAuthorityBoundaries.OPERATIONS.owns).toContain("fulfillment-status-transitions");
  });

  it("keeps role capabilities unique and inside the declared vocabulary", () => {
    for (const role of adminRoles) {
      const permissions = permissionsForRole(role);
      expect(new Set(permissions).size).toBe(permissions.length);
      expect(permissions.every((permission) => adminPermissions.includes(permission))).toBe(true);
    }
  });

  it("allows only owners to administer Store Admin and Operations access", () => {
    expect(roleHasPermission("OWNER", "users:admin-role.assign")).toBe(true);
    expect(roleHasPermission("OWNER", "operations-access:assign")).toBe(true);
    expect(roleHasPermission("OWNER", "operations-access:revoke")).toBe(true);

    for (const role of adminRoles.filter((candidate) => candidate !== "OWNER")) {
      expect(roleHasPermission(role, "users:admin-role.assign")).toBe(false);
      expect(roleHasPermission(role, "operations-access:assign")).toBe(false);
      expect(roleHasPermission(role, "operations-access:revoke")).toBe(false);
    }

    expect(canAssignAdminRole("OWNER", "MANAGER")).toBe(true);
    expect(canAssignAdminRole("MANAGER", "ANALYST_VIEWER")).toBe(false);
  });

  it("keeps audit export and Operations access mutations Owner-only", () => {
    expect(roleHasPermission("OWNER", "audit:export")).toBe(true);
    for (const role of adminRoles.filter((candidate) => candidate !== "OWNER")) {
      expect(roleHasPermission(role, "audit:export")).toBe(false);
      expect(roleHasPermission(role, "operations-access:assign")).toBe(false);
      expect(roleHasPermission(role, "operations-access:revoke")).toBe(false);
    }
    expect(roleHasPermission("MANAGER", "operations-access:read")).toBe(true);
    expect(roleHasPermission("CUSTOMER_SUPPORT", "operations:open")).toBe(true);
  });

  it("gives support request-only refund access and read/open access to Operations", () => {
    expect(roleHasPermission("CUSTOMER_SUPPORT", "returns:refund.request")).toBe(true);
    expect(roleHasPermission("CUSTOMER_SUPPORT", "operations:read")).toBe(true);
    expect(roleHasPermission("CUSTOMER_SUPPORT", "operations:open")).toBe(true);
    expect(roleHasPermission("CUSTOMER_SUPPORT", "integrations:retry")).toBe(false);
  });

  it("denies missing, inactive, non-MFA and underprivileged identities", () => {
    const request = { permission: "catalog:publish", resourceScope: { kind: "NOT_APPLICABLE" } } as const;

    expect(authorizeAdminAccess(null, request)).toEqual({
      allowed: false,
      code: "ADMIN_IDENTITY_REQUIRED"
    });
    expect(authorizeAdminAccess(principal({ status: "SUSPENDED" }), request)).toEqual({
      allowed: false,
      code: "ADMIN_IDENTITY_INACTIVE"
    });
    expect(authorizeAdminAccess(principal({ mfaVerified: false }), request)).toEqual({
      allowed: false,
      code: "ADMIN_MFA_REQUIRED"
    });
    expect(authorizeAdminAccess(principal({ role: "ANALYST_VIEWER" }), request)).toEqual({
      allowed: false,
      code: "ADMIN_PERMISSION_DENIED"
    });
  });

  it("enforces location scope without blocking non-location resources", () => {
    const scoped = principal({
      role: "CUSTOMER_SUPPORT",
      locationScope: { kind: "LOCATIONS", locationIds: ["location-1"] }
    });
    const permission = "orders:read" as const;

    expect(authorizeAdminAccess(scoped, {
      permission,
      resourceScope: { kind: "LOCATION", locationId: "location-1" }
    })).toEqual({ allowed: true });
    expect(authorizeAdminAccess(scoped, {
      permission,
      resourceScope: { kind: "LOCATION", locationId: "location-2" }
    })).toEqual({ allowed: false, code: "ADMIN_LOCATION_SCOPE_DENIED" });
    expect(authorizeAdminAccess(scoped, {
      permission,
      resourceScope: { kind: "GLOBAL" }
    })).toEqual({ allowed: false, code: "ADMIN_GLOBAL_SCOPE_DENIED" });
    expect(authorizeAdminAccess(scoped, {
      permission,
      resourceScope: { kind: "NOT_APPLICABLE" }
    })).toEqual({ allowed: true });
  });

  it.each<[AdminRole, string]>([
    ["MERCHANDISER", "catalog:merchandise"],
    ["MARKETING_CONTENT", "storefront:write"],
    ["CUSTOMER_SUPPORT", "customers:notes.write"],
    ["ANALYST_VIEWER", "analytics:export"]
  ])("grants %s its expected specialist capability", (role, permission) => {
    expect(roleHasPermission(role, permission as never)).toBe(true);
  });
});
