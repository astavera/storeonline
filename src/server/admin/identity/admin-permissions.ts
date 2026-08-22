/**
 * Declares the Store Admin permission vocabulary.
 *
 * Financial and operational mutations intentionally do not exist here. Square
 * remains authoritative for prices, inventory, taxes, payments, discounts and
 * refunds; Operations remains authoritative for fulfillment execution.
 */

export const adminPermissions = [
  "dashboard:read",
  "catalog:read",
  "catalog:merchandise",
  "catalog:publish",
  "inventory:read",
  "orders:read",
  "customers:read",
  "customers:notes.write",
  "customers:privacy.manage",
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
  "users:invite",
  "users:suspend",
  "users:admin-role.assign",
  "users:sessions.revoke",
  "operations-access:read",
  "operations-access:assign",
  "operations-access:revoke",
  "operations:read",
  "operations:open",
  "audit:read",
  "audit:export",
  "integrations:read",
  "integrations:retry",
  "integrations:credentials.manage"
] as const;

export type AdminPermission = (typeof adminPermissions)[number];

export const externalAuthorityBoundaries = {
  SQUARE: {
    owns: [
      "catalog-prices",
      "inventory-quantities",
      "tax-calculation",
      "payments",
      "financial-discounts",
      "refund-execution",
      "chargebacks"
    ],
    adminBoundary: "READ_OR_REQUEST_ONLY"
  },
  OPERATIONS: {
    owns: [
      "fulfillment-queues",
      "fulfillment-status-transitions",
      "pickup-execution",
      "delivery-execution",
      "warehouse-execution",
      "slots-and-capacity"
    ],
    adminBoundary: "READ_OR_OPEN_EXTERNAL_SYSTEM_ONLY"
  },
  SHIPPO: {
    owns: ["shipping-rates", "shipping-labels", "carrier-tracking"],
    adminBoundary: "READ_AND_CONFIGURATION_ONLY"
  }
} as const;

/** Capabilities that must never be emitted by a role-based Store Admin session. */
export const forbiddenRoleCapabilities = [
  "admin:*",
  "prices:write",
  "inventory:write",
  "taxes:calculate",
  "payments:write",
  "discounts:financial.write",
  "refunds:execute",
  "chargebacks:manage",
  "fulfillment:execute",
  "fulfillment:status.write",
  "shipping-labels:purchase"
] as const;

export function isAdminPermission(value: string): value is AdminPermission {
  return (adminPermissions as readonly string[]).includes(value);
}
