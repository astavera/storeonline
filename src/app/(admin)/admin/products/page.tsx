/**
 * Provides the canonical authenticated products workspace.
 */

import { AdminCatalogBrowser } from "@/components/admin/admin-catalog-browser";
import { adminCapabilities } from "@/server/admin/admin-security";
import { requireAdminSession } from "@/server/admin/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProductsPage() {
  await requireAdminSession({ capability: adminCapabilities.read, returnTo: "/admin/products" });

  return <AdminCatalogBrowser />;
}
