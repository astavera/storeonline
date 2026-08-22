/** Pure role-based access control for Store Admin identities. */

import {
  adminPermissions,
  type AdminPermission
} from "@/server/admin/identity/admin-permissions";

export const adminRoles = [
  "OWNER",
  "MANAGER",
  "MERCHANDISER",
  "MARKETING_CONTENT",
  "CUSTOMER_SUPPORT",
  "ANALYST_VIEWER"
] as const;

export type AdminRole = (typeof adminRoles)[number];

const managerPermissions = [
  "dashboard:read",
  "catalog:read",
  "catalog:merchandise",
  "catalog:publish",
  "inventory:read",
  "orders:read",
  "customers:read",
  "customers:notes.write",
  "returns:read",
  "returns:manage",
  "returns:refund.request",
  "storefront:read",
  "storefront:write",
  "storefront:publish",
  "media:read",
  "media:write",
  "promotions:read",
  "promotions:write",
  "promotions:publish",
  "analytics:read",
  "analytics:export",
  "store-settings:read",
  "store-settings:write",
  "store-settings:publish",
  "notifications:read",
  "notifications:write",
  "notifications:test-send",
  "notifications:resend",
  "users:read",
  "operations-access:read",
  "operations:read",
  "operations:open",
  "audit:read",
  "integrations:read",
  "integrations:retry"
] as const satisfies readonly AdminPermission[];

const rolePermissions = {
  OWNER: adminPermissions,
  MANAGER: managerPermissions,
  MERCHANDISER: [
    "dashboard:read",
    "catalog:read",
    "catalog:merchandise",
    "catalog:publish",
    "inventory:read",
    "storefront:read",
    "media:read",
    "media:write",
    "analytics:read"
  ],
  MARKETING_CONTENT: [
    "dashboard:read",
    "catalog:read",
    "storefront:read",
    "storefront:write",
    "storefront:publish",
    "media:read",
    "media:write",
    "promotions:read",
    "promotions:write",
    "promotions:publish",
    "analytics:read",
    "analytics:export",
    "notifications:read",
    "notifications:write",
    "notifications:test-send"
  ],
  CUSTOMER_SUPPORT: [
    "dashboard:read",
    "orders:read",
    "customers:read",
    "customers:notes.write",
    "returns:read",
    "returns:manage",
    "returns:refund.request",
    "notifications:read",
    "notifications:resend",
    "operations:read",
    "operations:open"
  ],
  ANALYST_VIEWER: [
    "dashboard:read",
    "catalog:read",
    "inventory:read",
    "orders:read",
    "analytics:read",
    "analytics:export",
    "audit:read",
    "integrations:read"
  ]
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

export type AdminIdentityStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "DISABLED";

export type AdminLocationScope =
  | { kind: "ALL" }
  | { kind: "LOCATIONS"; locationIds: readonly string[] };

export type AdminPrincipal = Readonly<{
  id: string;
  role: AdminRole;
  status: AdminIdentityStatus;
  mfaVerified: boolean;
  locationScope: AdminLocationScope;
}>;

export type AdminResourceScope =
  | { kind: "NOT_APPLICABLE" }
  | { kind: "GLOBAL" }
  | { kind: "LOCATION"; locationId: string };

export type AdminAccessRequest = Readonly<{
  permission: AdminPermission;
  resourceScope: AdminResourceScope;
}>;

export type AdminAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      code:
        | "ADMIN_IDENTITY_REQUIRED"
        | "ADMIN_IDENTITY_INACTIVE"
        | "ADMIN_MFA_REQUIRED"
        | "ADMIN_PERMISSION_DENIED"
        | "ADMIN_GLOBAL_SCOPE_DENIED"
        | "ADMIN_LOCATION_SCOPE_DENIED";
    };

export function isAdminRole(value: string): value is AdminRole {
  return (adminRoles as readonly string[]).includes(value);
}

export function permissionsForRole(role: AdminRole): readonly AdminPermission[] {
  return rolePermissions[role];
}

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return (rolePermissions[role] as readonly AdminPermission[]).includes(permission);
}

export function authorizeAdminAccess(
  principal: AdminPrincipal | null,
  request: AdminAccessRequest
): AdminAccessDecision {
  if (!principal) return { allowed: false, code: "ADMIN_IDENTITY_REQUIRED" };
  if (principal.status !== "ACTIVE") {
    return { allowed: false, code: "ADMIN_IDENTITY_INACTIVE" };
  }
  if (!principal.mfaVerified) return { allowed: false, code: "ADMIN_MFA_REQUIRED" };
  if (!roleHasPermission(principal.role, request.permission)) {
    return { allowed: false, code: "ADMIN_PERMISSION_DENIED" };
  }

  if (request.resourceScope.kind === "NOT_APPLICABLE" || principal.locationScope.kind === "ALL") {
    return { allowed: true };
  }
  if (request.resourceScope.kind === "GLOBAL") {
    return { allowed: false, code: "ADMIN_GLOBAL_SCOPE_DENIED" };
  }
  if (!principal.locationScope.locationIds.includes(request.resourceScope.locationId)) {
    return { allowed: false, code: "ADMIN_LOCATION_SCOPE_DENIED" };
  }
  return { allowed: true };
}

export function canAssignAdminRole(actorRole: AdminRole, targetRole: AdminRole): boolean {
  return actorRole === "OWNER" && roleHasPermission(actorRole, "users:admin-role.assign") && isAdminRole(targetRole);
}

export function roleSessionCapabilities(role: AdminRole): readonly AdminPermission[] {
  return [...permissionsForRole(role)];
}
