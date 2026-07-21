import { ProductPlacementManager } from "@/components/admin/product-placement-manager";
import { reconcileWebsiteMerchandising, websiteCategoryPath } from "@/features/catalog/services/website-merchandising-service";
import { readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";
import { readSquareCatalogCacheSummary, readSquareVendorsFromCatalogCache } from "@/server/square/catalog-test-cache-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProductPlacementPage() {
  const cacheSummary = readSquareCatalogCacheSummary();
  const [catalog, fullConfig] = await Promise.all([readSquareCatalogPreview(), readWebsiteMerchandisingSnapshot()]);

  if (!catalog && !cacheSummary.available) {
    return (
      <main className="p-6">
        <div className="surface-card p-6">
          <h1 className="font-display text-3xl font-semibold">Category &amp; Product Placement</h1>
          <p className="mt-3 text-secondary">Create the local read-only Square catalog snapshot before using placement controls.</p>
        </div>
      </main>
    );
  }

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
  const squareVendors = readSquareVendorsFromCatalogCache();
  return <ProductPlacementManager fetchedAt={catalog?.fetchedAt ?? cacheSummary.updatedAt ?? new Date().toISOString()} hasMoreItems={catalog?.hasMoreItems ?? cacheSummary.hasMore} initialBrandProductCounts={initialBrandProductCounts} initialCategoryProductCounts={initialCategoryProductCounts} initialConfig={initialConfig} products={previewProducts} squareVendors={squareVendors} />;
}
