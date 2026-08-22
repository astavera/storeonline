/**
 * Provides the authenticated read-only sales and returns dashboard.
 */

import { AdminOrdersDashboard } from "@/components/admin/admin-orders-dashboard";
import { adminCapabilities } from "@/server/admin/admin-security";
import { requireAdminSession } from "@/server/admin/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOrdersPage() {
  await requireAdminSession({ capability: adminCapabilities.read, returnTo: "/admin/orders" });

  return <AdminOrdersDashboard orderProUrl={process.env.ORDERPRO_ADMIN_URL} />;
}
