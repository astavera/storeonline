/** Minimum permission required to enter each Store Admin page. */

import type { AdminPermission } from "@/server/admin/identity/admin-permissions";

const routePermissions: ReadonlyArray<readonly [string, AdminPermission]> = [
  ["/admin/users-roles", "users:read"],
  ["/admin/audit-log", "audit:read"],
  ["/admin/sync-status", "integrations:read"],
  ["/admin/webhooks", "integrations:read"],
  ["/admin/settings", "store-settings:read"],
  ["/admin/notifications", "notifications:read"],
  ["/admin/promotions", "promotions:read"],
  ["/admin/analytics", "analytics:read"],
  ["/admin/media", "media:read"],
  ["/admin/orders", "orders:read"],
  ["/admin/customers", "customers:read"],
  ["/admin/returns", "returns:read"],
  ["/admin/fulfillment", "operations:read"],
  ["/admin/slots", "operations:read"],
  ["/admin/shipping", "operations:read"],
  ["/admin/delivery-zones", "operations:read"],
  ["/admin/homepage", "storefront:read"],
  ["/admin/builder", "storefront:read"],
  ["/admin/storefront-pages", "storefront:read"],
  ["/admin/navigation", "storefront:read"],
  ["/admin/theme", "storefront:read"],
  ["/admin/products", "catalog:read"],
  ["/admin/catalog", "catalog:read"],
  ["/admin/product-placement", "catalog:read"],
  ["/admin/product-display", "catalog:read"],
  ["/admin/product-images", "catalog:read"],
  ["/admin/product-overrides", "catalog:read"],
  ["/admin/product-seo", "catalog:read"],
  ["/admin/balloons", "catalog:read"],
  ["/admin/holidays", "catalog:read"],
  ["/admin/departments", "catalog:read"],
  ["/admin/locations", "store-settings:read"]
];

export function adminPagePermission(pathname: string): AdminPermission {
  if (pathname === "/admin") return "dashboard:read";
  return routePermissions.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? "dashboard:read";
}
