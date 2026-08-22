/**
 * Provides the authenticated read-only inventory workspace.
 */

import { AdminInventoryBrowser } from "@/components/admin/admin-inventory-browser";
import { adminCapabilities } from "@/server/admin/admin-security";
import { requireAdminSession } from "@/server/admin/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminInventoryPage() {
  await requireAdminSession({ capability: adminCapabilities.read, returnTo: "/admin/inventory" });

  return <AdminInventoryBrowser />;
}
