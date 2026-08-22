/**
 * Provides the canonical authenticated products workspace.
 */

import { AdminCatalogBrowser } from "@/components/admin/admin-catalog-browser";
import { AdminProductPublishingWorkspace } from "@/components/admin/admin-product-publishing-workspace";
import {
  AdminProductsWorkspace,
  resolveAdminProductsTab
} from "@/components/admin/admin-products-workspace";
import { requireAdminSession } from "@/server/admin/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProductsPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const activeTab = resolveAdminProductsTab(parameters?.tab);
  const returnTo = activeTab === "publishing"
    ? "/admin/products?tab=publishing"
    : "/admin/products";

  await requireAdminSession({ capability: "catalog:read", returnTo });

  return (
    <AdminProductsWorkspace activeTab={activeTab}>
      {activeTab === "publishing"
        ? <AdminProductPublishingWorkspace />
        : <AdminCatalogBrowser />}
    </AdminProductsWorkspace>
  );
}
