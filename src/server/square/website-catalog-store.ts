/**
 * Implements server-side website catalog store behavior and persistence boundaries.
 */

import "server-only";

import { storefrontProducts } from "@/features/catalog/product-catalog";
import {
  resolveWebsiteCatalog,
  slugifyWebsiteCategory,
  type ResolvedWebsiteCatalog,
  type WebsiteMerchandisingConfig
} from "@/features/catalog/services/website-merchandising-service";
import {
  readDevelopmentLocalWebsiteMerchandisingSnapshot,
  readWebsiteMerchandising,
  readWebsiteMerchandisingSnapshot
} from "@/server/admin/website-merchandising-store";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";
import { readPostgresCatalogSummary, readPostgresStorefrontProductsByVariationIds } from "@/server/square/postgres-catalog-store";
import { readProductShippingProfilesByVariationIds } from "@/server/products/product-shipping-profile-store";

export type SquareWebsiteCatalogSource = {
  catalog: ResolvedWebsiteCatalog;
  source: "postgres" | "legacy-sqlite" | "preview" | "static-preview";
  sourceVariationCount: number;
  fetchedAt: string;
};

const e2eFixtureUpdatedAt = "2026-01-01T00:00:00.000Z";

export async function readResolvedSquareWebsiteCatalog(
  options: { squareLocationIds?: string[] } = {}
): Promise<SquareWebsiteCatalogSource | null> {
  if (process.env.E2E_CATALOG_FIXTURE === "true") {
    return readE2eWebsiteCatalogFixture();
  }
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
      const shippingVariationIds = config.placements
        .filter((placement) => placement.visible && placement.fulfillmentModes.includes("shipping"))
        .map((placement) => placement.squareVariationId);
      const [products, shippingProfiles] = await Promise.all([
        readPostgresStorefrontProductsByVariationIds(visibleVariationIds, options),
        readProductShippingProfilesByVariationIds(shippingVariationIds)
      ]);
      const eligibleConfig = applyProductShippingEligibility(config, shippingProfiles);

      return {
        catalog: resolveWebsiteCatalog(products, eligibleConfig),
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

export function applyProductShippingEligibility(
  config: WebsiteMerchandisingConfig,
  profiles: ReadonlyMap<string, { shippingEnabled: boolean }>
): WebsiteMerchandisingConfig {
  return {
    ...config,
    placements: config.placements.map((placement) => (
      placement.fulfillmentModes.includes("shipping") && !profiles.get(placement.squareVariationId)?.shippingEnabled
        ? {
            ...placement,
            fulfillmentModes: placement.fulfillmentModes.filter((mode) => mode !== "shipping")
          }
        : placement
    ))
  };
}

function readE2eWebsiteCatalogFixture(): SquareWebsiteCatalogSource {
  const departments = Array.from(new Set(storefrontProducts.map((product) => product.department)));
  const categoryIdByDepartment = new Map(
    departments.map((department) => [department, `e2e-${slugifyWebsiteCategory(department)}`])
  );
  const config = {
    version: 3,
    updatedAt: e2eFixtureUpdatedAt,
    categories: departments.map((department, index) => ({
      id: categoryIdByDepartment.get(department)!,
      name: department,
      slug: slugifyWebsiteCategory(department),
      description: "",
      imageUrl: "",
      imageAlt: "",
      parentId: null,
      visible: true,
      sortOrder: index
    })),
    brands: [],
    holidays: [],
    placements: storefrontProducts.map((product, index) => ({
      squareVariationId: product.squareVariationId,
      categoryIds: [categoryIdByDepartment.get(product.department)!],
      brandIds: [],
      holidayAssignments: [],
      ageGroups: product.ageGroups ?? [],
      fulfillmentModes: product.fulfillmentModes,
      surfaceIds: ["shop", "search", "category-pages"],
      visible: true,
      sortOrder: index
    }))
  } satisfies WebsiteMerchandisingConfig;

  return {
    catalog: resolveWebsiteCatalog(storefrontProducts, config),
    source: "static-preview",
    sourceVariationCount: storefrontProducts.length,
    fetchedAt: config.updatedAt
  };
}
