/**
 * Loads the real website-merchandising snapshot only when the publishing tab is active.
 */

import { ProductPlacementManager } from "@/components/admin/product-placement-manager";
import { websiteCategoryPath } from "@/features/catalog/services/website-merchandising-service";
import { readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { isDevelopmentLocalPersistenceEnabled } from "@/server/db/persistence-policy";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";
import { readPostgresAdminCatalogSummary } from "@/server/square/postgres-admin-catalog-store";

export async function AdminProductPublishingWorkspace() {
  const [catalog, fullConfig, catalogSummary] = await Promise.all([
    readSquareCatalogPreview(),
    readWebsiteMerchandisingSnapshot(),
    readAdminCatalogSummary()
  ]);

  const previewProducts = catalog?.products ?? [];
  const initialBrandProductCounts = Object.fromEntries(
    fullConfig.brands.map((brand) => [
      brand.id,
      fullConfig.placements.filter((placement) => placement.brandIds.includes(brand.id)).length
    ])
  );
  const variationIdsByCategory = new Map(
    fullConfig.categories.map((category) => [category.id, new Set<string>()])
  );

  for (const placement of fullConfig.placements) {
    for (const categoryId of placement.categoryIds) {
      const category = fullConfig.categories.find((candidate) => candidate.id === categoryId);
      if (!category) continue;

      for (const pathCategory of websiteCategoryPath(category, fullConfig.categories)) {
        variationIdsByCategory.get(pathCategory.id)?.add(placement.squareVariationId);
      }
    }
  }

  const initialCategoryProductCounts = Object.fromEntries(
    fullConfig.categories.map((category) => [
      category.id,
      variationIdsByCategory.get(category.id)?.size ?? 0
    ])
  );

  return (
    <ProductPlacementManager
      initialBrandProductCounts={initialBrandProductCounts}
      initialCategoryProductCounts={initialCategoryProductCounts}
      initialConfig={fullConfig}
      products={previewProducts}
      squareInboxCount={catalogSummary.variationCount}
      squareVendors={[]}
    />
  );
}

async function readAdminCatalogSummary() {
  const preferLocalCatalog =
    process.env.NODE_ENV === "development" &&
    process.env.PREFER_LOCAL_SQUARE_CATALOG === "true";

  if (preferLocalCatalog) {
    const { readSquareCatalogCacheSummary } = await import(
      "@/server/square/catalog-test-cache-store"
    );
    return readSquareCatalogCacheSummary();
  }

  try {
    return await readPostgresAdminCatalogSummary();
  } catch (error) {
    if (!isDevelopmentLocalPersistenceEnabled()) throw error;

    const { readSquareCatalogCacheSummary } = await import(
      "@/server/square/catalog-test-cache-store"
    );
    return readSquareCatalogCacheSummary();
  }
}
