/**
 * Implements server-side website catalog store behavior and persistence boundaries.
 */

import "server-only";

import { resolveWebsiteCatalog, type ResolvedWebsiteCatalog } from "@/features/catalog/services/website-merchandising-service";
import {
  readDevelopmentLocalWebsiteMerchandisingSnapshot,
  readWebsiteMerchandising,
  readWebsiteMerchandisingSnapshot
} from "@/server/admin/website-merchandising-store";
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
  const preferLocalCatalog =
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_LOCAL_PERSISTENCE_FALLBACK === "true" &&
    process.env.PREFER_LOCAL_SQUARE_CATALOG === "true";
  let summary: Awaited<ReturnType<typeof readPostgresCatalogSummary>>;

  if (preferLocalCatalog) {
    summary = {
      available: false,
      environment: null,
      itemCount: 0,
      variationCount: 0,
      updatedAt: null
    };
  } else {
    try {
      summary = await readPostgresCatalogSummary();
    } catch (error) {
      if (
        process.env.NODE_ENV !== "development" ||
        process.env.ALLOW_LOCAL_PERSISTENCE_FALLBACK !== "true"
      ) {
        throw error;
      }

      console.warn("[development-local-persistence] PostgreSQL Square catalog unavailable; reading the local catalog cache.");
      summary = {
        available: false,
        environment: null,
        itemCount: 0,
        variationCount: 0,
        updatedAt: null
      };
    }
  }

  if (summary.available) {
    try {
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
    } catch (error) {
      if (
        process.env.NODE_ENV !== "development" ||
        process.env.ALLOW_LOCAL_PERSISTENCE_FALLBACK !== "true"
      ) {
        throw error;
      }

      console.warn("[development-local-persistence] PostgreSQL Square catalog read failed; reading the local catalog cache.");
    }
  }

  if (process.env.NODE_ENV === "development" && process.env.ALLOW_LOCAL_PERSISTENCE_FALLBACK === "true") {
    const { readSquareCatalogCacheSummary, readSquareStorefrontProductsByVariationIds } = await import("@/server/square/catalog-test-cache-store");
    const legacySummary = readSquareCatalogCacheSummary();
    if (legacySummary.available) {
      const config = preferLocalCatalog
        ? await readDevelopmentLocalWebsiteMerchandisingSnapshot()
        : await readWebsiteMerchandisingSnapshot();
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
