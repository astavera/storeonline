/**
 * Provides an authenticated, read-only view of the complete synchronized Square catalog.
 */

import { AdminCatalogBrowser } from "@/components/admin/admin-catalog-browser";
import { requireAdminSession } from "@/server/admin/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCatalogPage() {
  await requireAdminSession({ capability: "catalog:read", returnTo: "/admin/catalog" });

  return <AdminCatalogBrowser />;
}
