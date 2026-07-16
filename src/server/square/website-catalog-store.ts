import "server-only";

import { resolveWebsiteCatalog, type ResolvedWebsiteCatalog } from "@/features/catalog/services/website-merchandising-service";
import { readWebsiteMerchandising, readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";
import { readPostgresCatalogSummary, readPostgresStorefrontProductsByVariationIds } from "@/server/square/postgres-catalog-store";

export type SquareWebsiteCatalogSource = {
  catalog: ResolvedWebsiteCatalog;
  source: "postgres" | "legacy-sqlite" | "preview";
  sourceVariationCount: number;
  fetchedAt: string;
};

export async function readResolvedSquareWebsiteCatalog(
  options: { squareLocationIds?: string[] } = {}
): Promise<SquareWebsiteCatalogSource | null> {
  if (process.env.E2E_CATALOG_FIXTURE === "true") return null;
  const summary = await readPostgresCatalogSummary();

  if (summary.available) {
    const config = await readWebsiteMerchandisingSnapshot();
    const visibleVariationIds = config.placements
      .filter((placement) => placement.visible)
      .map((placement) => placement.squareVariationId);
    const products = await readPostgresStorefrontProductsByVariationIds(visibleVariationIds, options);

    return {
      catalog: resolveWebsiteCatalog(products, config),
      source: "postgres",
      sourceVariationCount: summary.variationCount,
      fetchedAt: summary.updatedAt ?? config.updatedAt
    };
  }

  if (process.env.NODE_ENV === "development" && process.env.ALLOW_LOCAL_PERSISTENCE_FALLBACK === "true") {
    const { readSquareCatalogCacheSummary, readSquareStorefrontProductsByVariationIds } = await import("@/server/square/catalog-test-cache-store");
    const legacySummary = readSquareCatalogCacheSummary();
    if (legacySummary.available) {
      const config = await readWebsiteMerchandisingSnapshot();
      const visibleVariationIds = config.placements.filter((placement) => placement.visible).map((placement) => placement.squareVariationId);
      const products = readSquareStorefrontProductsByVariationIds(visibleVariationIds);
      return {
        catalog: resolveWebsiteCatalog(products, config),
        source: "legacy-sqlite",
        sourceVariationCount: legacySummary.variationCount,
        fetchedAt: legacySummary.updatedAt ?? config.updatedAt
      };
    }
  }

  if (process.env.SQUARE_ENVIRONMENT === "production") return null;

  const preview = await readSquareCatalogPreview();
  if (!preview) return null;
  const config = await readWebsiteMerchandising(preview.products);

  return {
    catalog: resolveWebsiteCatalog(preview.products, config),
    source: "preview",
    sourceVariationCount: preview.products.length,
    fetchedAt: preview.fetchedAt
  };
}
