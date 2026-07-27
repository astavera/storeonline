import { ProductPlacementManager } from "@/components/admin/product-placement-manager";
import { reconcileWebsiteMerchandising, websiteCategoryPath } from "@/features/catalog/services/website-merchandising-service";
import { readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";
import { readPostgresAdminCatalogSummary } from "@/server/square/postgres-admin-catalog-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProductPlacementPage() {
  const [catalog, fullConfig, catalogSummary] = await Promise.all([
    readSquareCatalogPreview(),
    readWebsiteMerchandisingSnapshot(),
    readPostgresAdminCatalogSummary()
  ]);

  const previewProducts = catalog?.products ?? [];
  const initialConfig = reconcileWebsiteMerchandising(fullConfig, previewProducts);
  const initialBrandProductCounts = Object.fromEntries(
    fullConfig.brands.map((brand) => [brand.id, fullConfig.placements.filter((placement) => placement.brandIds.includes(brand.id)).length])
  );
  const variationIdsByCategory = new Map(fullConfig.categories.map((category) => [category.id, new Set<string>()]));
  for (const placement of fullConfig.placements) {
    for (const categoryId of placement.categoryIds) {
      const category = fullConfig.categories.find((candidate) => candidate.id === categoryId);
      if (!category) continue;
      for (const pathCategory of websiteCategoryPath(category, fullConfig.categories)) {
        variationIdsByCategory.get(pathCategory.id)?.add(placement.squareVariationId);
      }
    }
  }
  const initialCategoryProductCounts = Object.fromEntries(fullConfig.categories.map((category) => [category.id, variationIdsByCategory.get(category.id)?.size ?? 0]));
  return <ProductPlacementManager fetchedAt={catalog?.fetchedAt ?? catalogSummary.updatedAt ?? new Date().toISOString()} hasMoreItems={catalog?.hasMoreItems ?? false} initialBrandProductCounts={initialBrandProductCounts} initialCategoryProductCounts={initialCategoryProductCounts} initialConfig={initialConfig} products={previewProducts} squareVendors={[]} />;
}
