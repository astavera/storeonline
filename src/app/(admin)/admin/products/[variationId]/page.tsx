/**
 * Provides the authenticated website editor for one synchronized Square variation.
 */

import { notFound } from "next/navigation";
import { AdminProductEditor } from "@/components/admin/admin-product-editor";
import type { WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";
import { adminCapabilities } from "@/server/admin/admin-security";
import { requireAdminSession } from "@/server/admin/admin-session";
import { readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readPostgresAdminProductsByVariationIds } from "@/server/square/postgres-admin-catalog-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProductEditorPage({ params }: { params: Promise<{ variationId: string }> }) {
  const { variationId } = await params;
  await requireAdminSession({
    capability: adminCapabilities.read,
    returnTo: `/admin/products/${encodeURIComponent(variationId)}`
  });

  const [product] = await readPostgresAdminProductsByVariationIds([variationId]);
  if (!product) notFound();

  const merchandising = await readWebsiteMerchandisingSnapshot();
  const placement = merchandising.placements.find(
    (candidate) => candidate.squareVariationId === product.squareVariationId
  );

  return (
    <AdminProductEditor
      brands={merchandising.brands}
      categories={merchandising.categories}
      holidays={merchandising.holidays}
      initialPlacement={placement ?? createPendingPlacement(product.squareVariationId, merchandising.placements.length)}
      initiallySaved={Boolean(placement)}
      product={product}
    />
  );
}

function createPendingPlacement(squareVariationId: string, sortOrder: number): WebsiteProductPlacement {
  return {
    squareVariationId,
    categoryIds: [],
    brandIds: [],
    holidayAssignments: [],
    ageGroups: [],
    fulfillmentModes: [],
    surfaceIds: [],
    visible: false,
    sortOrder
  };
}
