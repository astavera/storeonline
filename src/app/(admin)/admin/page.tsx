/**
 * Renders the admin page and prepares its route-level data.
 */

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { redirect } from "next/navigation";
import { isStorefrontAdminPreviewEnabled } from "@/server/storefront/admin-preview";
import { requireAdminSession } from "@/server/admin/admin-session";

export default async function AdminDashboardPage() {
  if (isStorefrontAdminPreviewEnabled()) {
    redirect("/admin/homepage");
  }

  const session = await requireAdminSession({ capability: "dashboard:read", returnTo: "/admin" });
  const can = (permission: string) => session.capabilities.includes("admin:*") || session.capabilities.includes(permission);
  return <AdminDashboard canReadAnalytics={can("analytics:read")} canReadCatalog={can("catalog:read")} canReadCustomers={can("customers:read")} canReadOrders={can("orders:read")} canReadReturns={can("returns:read")} />;
}
