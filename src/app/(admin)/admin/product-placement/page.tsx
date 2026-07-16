import { ProductPlacementManager } from "@/components/admin/product-placement-manager";
import { readWebsiteMerchandising, readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";
import { readSquareCatalogCacheSummary, readSquareVendorsFromCatalogCache } from "@/server/square/catalog-test-cache-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProductPlacementPage() {
  const catalog = await readSquareCatalogPreview();
  const cacheSummary = readSquareCatalogCacheSummary();

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
  const [initialConfig, fullConfig] = await Promise.all([
    readWebsiteMerchandising(previewProducts),
    readWebsiteMerchandisingSnapshot()
  ]);
  const initialBrandProductCounts = Object.fromEntries(
    fullConfig.brands.map((brand) => [brand.id, fullConfig.placements.filter((placement) => placement.brandIds.includes(brand.id)).length])
  );
  const variationIdsByCategory = new Map(fullConfig.categories.map((category) => [category.id, new Set<string>()]));
  for (const placement of fullConfig.placements) {
    for (const categoryId of placement.categoryIds) variationIdsByCategory.get(categoryId)?.add(placement.squareVariationId);
  }
  for (const category of fullConfig.categories) {
    if (!category.parentId) continue;
    const parentVariationIds = variationIdsByCategory.get(category.parentId);
    for (const variationId of variationIdsByCategory.get(category.id) ?? []) parentVariationIds?.add(variationId);
  }
  const initialCategoryProductCounts = Object.fromEntries(fullConfig.categories.map((category) => [category.id, variationIdsByCategory.get(category.id)?.size ?? 0]));
  const squareVendors = readSquareVendorsFromCatalogCache();
  return <ProductPlacementManager fetchedAt={catalog?.fetchedAt ?? cacheSummary.updatedAt ?? new Date().toISOString()} hasMoreItems={catalog?.hasMoreItems ?? cacheSummary.hasMore} initialBrandProductCounts={initialBrandProductCounts} initialCategoryProductCounts={initialCategoryProductCounts} initialConfig={initialConfig} products={previewProducts} squareVendors={squareVendors} />;
}
