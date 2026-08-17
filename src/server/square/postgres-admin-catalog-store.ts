/**
 * Implements server-side postgres admin catalog store behavior and persistence boundaries.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import type {
  SquareCatalogCacheSummary,
  SquareCatalogCategorySummary
} from "@/features/catalog/square-catalog-cache";
import { storefrontProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import {
  readPostgresCatalogSummary,
  readPostgresStorefrontProductsByVariationIds,
  type PostgresCatalogSummary
} from "@/server/square/postgres-catalog-store";

export type PostgresCatalogImageFilter = "all" | "with" | "without";

type CatalogQuery = {
  categoryId?: string;
  imageFilter?: PostgresCatalogImageFilter;
  page?: number;
  pageSize?: number;
  query?: string;
  variationIds?: string[];
  vendorId?: string;
};

export type PostgresAdminCatalogPage = {
  products: StorefrontProduct[];
  summary: SquareCatalogCacheSummary;
  query: string;
  categoryId: string;
  vendorId: string;
  imageFilter: PostgresCatalogImageFilter;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

export type PostgresAdminCatalogSelection = {
  variationIds: string[];
  total: number;
  truncated: boolean;
  query: string;
  categoryId: string;
  vendorId: string;
  imageFilter: PostgresCatalogImageFilter;
};

type CountRow = { total: bigint | number | string };
type IdRow = { id: string };
type CategoryRow = {
  id: string;
  name: string | null;
  item_count: bigint | number | string;
  variation_count: bigint | number | string;
};

export async function readPostgresAdminCatalogPage(options: CatalogQuery = {}): Promise<PostgresAdminCatalogPage> {
  if (usesE2eCatalogFixture()) return readE2eAdminCatalogPage(options);

  const normalized = normalizeQuery(options);
  const prisma = getPrismaClient();
  const fromWhere = catalogFromWhere(normalized);

  try {
    const catalog = await requireCompletedPostgresCatalog();
    const [countRows, summary] = await Promise.all([
      prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS total ${fromWhere}`),
      buildPostgresAdminCatalogSummary(catalog)
    ]);
    const total = safeCount(countRows[0]?.total);
    const pageCount = Math.max(1, Math.ceil(total / normalized.pageSize));
    const page = Math.min(normalized.page, pageCount);
    const offset = (page - 1) * normalized.pageSize;
    const idRows = total === 0
      ? []
      : await prisma.$queryRaw<IdRow[]>(Prisma.sql`
          SELECT variation."id" AS id
          ${fromWhere}
          ORDER BY lower(COALESCE(item."name", '')), lower(variation."name"), variation."id"
          LIMIT ${normalized.pageSize}
          OFFSET ${offset}
        `);
    const products = await readPostgresStorefrontProductsByVariationIds(idRows.map((row) => row.id));

    return {
      products,
      summary,
      query: normalized.query,
      categoryId: normalized.categoryId,
      vendorId: normalized.vendorId,
      imageFilter: normalized.imageFilter,
      page,
      pageSize: normalized.pageSize,
      pageCount,
      total
    };
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("PostgreSQL admin catalog", { cause: error });
  }
}

export async function readPostgresAdminVariationSelection(
  options: CatalogQuery = {},
  limit = 5_000
): Promise<PostgresAdminCatalogSelection> {
  if (usesE2eCatalogFixture()) return readE2eAdminCatalogSelection(options, limit);

  const normalized = normalizeQuery(options);
  const safeLimit = clampInteger(limit, 5_000, 1, 5_000);
  const prisma = getPrismaClient();
  const fromWhere = catalogFromWhere(normalized);

  try {
    await requireCompletedPostgresCatalog();
    const [countRows, idRows] = await Promise.all([
      prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS total ${fromWhere}`),
      prisma.$queryRaw<IdRow[]>(Prisma.sql`
        SELECT variation."id" AS id
        ${fromWhere}
        ORDER BY lower(COALESCE(item."name", '')), lower(variation."name"), variation."id"
        LIMIT ${safeLimit}
      `)
    ]);
    const total = safeCount(countRows[0]?.total);
    const variationIds = idRows.map((row) => row.id);

    return {
      variationIds,
      total,
      truncated: total > variationIds.length,
      query: normalized.query,
      categoryId: normalized.categoryId,
      vendorId: normalized.vendorId,
      imageFilter: normalized.imageFilter
    };
  } catch (error) {
    throw new PersistenceUnavailableError("PostgreSQL admin catalog selection", { cause: error });
  }
}

export async function readPostgresAdminCatalogCategories(): Promise<SquareCatalogCategorySummary[]> {
  if (usesE2eCatalogFixture()) return readE2eAdminCatalogCategories();

  try {
    await requireCompletedPostgresCatalog();
    const rows = await getPrismaClient().$queryRaw<CategoryRow[]>(Prisma.sql`
      WITH item_categories AS (
        SELECT item."id" AS item_id, unnest(item."categoryIds") AS category_id
        FROM "SquareCatalogObject" item
        WHERE item."type" = 'ITEM'
          AND item."deletedAt" IS NULL
      )
      SELECT
        category."id" AS id,
        category."name" AS name,
        COUNT(DISTINCT item_categories.item_id)::bigint AS item_count,
        COUNT(variation."id")::bigint AS variation_count
      FROM "SquareCatalogObject" category
      LEFT JOIN item_categories
        ON item_categories.category_id = category."id"
      LEFT JOIN "SquareItemVariation" variation
        ON variation."itemId" = item_categories.item_id
       AND variation."deletedAt" IS NULL
      WHERE category."type" = 'CATEGORY'
        AND category."deletedAt" IS NULL
      GROUP BY category."id", category."name"
      ORDER BY lower(COALESCE(category."name", '')), category."id"
    `);

    return rows.map((row) => {
      const name = row.name?.trim() || "Unnamed category";
      return {
        id: row.id,
        name,
        path: name,
        parentCategoryId: null,
        itemCount: safeCount(row.item_count),
        variationCount: safeCount(row.variation_count)
      };
    });
  } catch (error) {
    throw new PersistenceUnavailableError("PostgreSQL Square categories", { cause: error });
  }
}

export async function readPostgresAdminCatalogSummary(): Promise<SquareCatalogCacheSummary> {
  if (usesE2eCatalogFixture()) return e2eAdminCatalogSummary();

  try {
    return buildPostgresAdminCatalogSummary(await requireCompletedPostgresCatalog());
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("PostgreSQL admin catalog summary", { cause: error });
  }
}

export async function readPostgresAdminProductsByVariationIds(variationIds: string[]) {
  if (usesE2eCatalogFixture()) {
    const requestedIds = new Set(variationIds);
    return storefrontProducts.filter((product) => requestedIds.has(product.squareVariationId));
  }

  return readPostgresStorefrontProductsByVariationIds(variationIds);
}

async function requireCompletedPostgresCatalog(): Promise<PostgresCatalogSummary> {
  const catalog = await readPostgresCatalogSummary();
  if (!catalog.available || !catalog.environment || !catalog.updatedAt) {
    throw new PersistenceUnavailableError("Completed Square catalog synchronization for the active environment");
  }

  return catalog;
}

async function buildPostgresAdminCatalogSummary(catalog: PostgresCatalogSummary): Promise<SquareCatalogCacheSummary> {
  const objectCounts = await getPrismaClient().squareCatalogObject.groupBy({
    by: ["type"],
    where: { deletedAt: null, type: { in: ["IMAGE", "CATEGORY"] } },
    _count: { _all: true }
  });
  const countByType = new Map(objectCounts.map((entry) => [entry.type, entry._count._all]));

  return {
    available: true,
    environment: catalog.environment === "production" || catalog.environment === "sandbox" ? catalog.environment : null,
    status: "completed",
    hasMore: false,
    pagesCompleted: 0,
    itemCount: catalog.itemCount,
    variationCount: catalog.variationCount,
    imageCount: countByType.get("IMAGE") ?? 0,
    categoryCount: countByType.get("CATEGORY") ?? 0,
    vendorCount: 0,
    updatedAt: catalog.updatedAt
  };
}

function readE2eAdminCatalogPage(options: CatalogQuery = {}): PostgresAdminCatalogPage {
  const normalized = normalizeQuery(options);
  const matchingProducts = filterE2eAdminCatalog(normalized);
  const total = matchingProducts.length;
  const pageCount = Math.max(1, Math.ceil(total / normalized.pageSize));
  const page = Math.min(normalized.page, pageCount);
  const offset = (page - 1) * normalized.pageSize;

  return {
    products: matchingProducts.slice(offset, offset + normalized.pageSize),
    summary: e2eAdminCatalogSummary(),
    query: normalized.query,
    categoryId: normalized.categoryId,
    vendorId: normalized.vendorId,
    imageFilter: normalized.imageFilter,
    page,
    pageSize: normalized.pageSize,
    pageCount,
    total
  };
}

function readE2eAdminCatalogSelection(options: CatalogQuery = {}, limit = 5_000): PostgresAdminCatalogSelection {
  const normalized = normalizeQuery(options);
  const safeLimit = clampInteger(limit, 5_000, 1, 5_000);
  const matchingProducts = filterE2eAdminCatalog(normalized);
  const variationIds = matchingProducts.slice(0, safeLimit).map((product) => product.squareVariationId);

  return {
    variationIds,
    total: matchingProducts.length,
    truncated: matchingProducts.length > variationIds.length,
    query: normalized.query,
    categoryId: normalized.categoryId,
    vendorId: normalized.vendorId,
    imageFilter: normalized.imageFilter
  };
}

function filterE2eAdminCatalog(query: ReturnType<typeof normalizeQuery>) {
  const requestedIds = query.variationIds === undefined ? null : new Set(query.variationIds);
  const normalizedSearch = query.query.toLowerCase();

  return storefrontProducts.filter((product) => {
    if (requestedIds && !requestedIds.has(product.squareVariationId)) return false;
    if (query.categoryId && e2eCategoryId(product.department) !== query.categoryId) return false;
    if (query.vendorId && !product.squareVendorIds?.includes(query.vendorId)) return false;
    if (query.imageFilter === "with" && !product.imageUrl.trim()) return false;
    if (query.imageFilter === "without" && product.imageUrl.trim()) return false;
    if (!normalizedSearch) return true;

    return [product.name, product.slug, product.squareVariationId, product.shortDescription]
      .some((value) => value.toLowerCase().includes(normalizedSearch));
  });
}

function readE2eAdminCatalogCategories(): SquareCatalogCategorySummary[] {
  const categoryCounts = new Map<string, { name: string; count: number }>();

  for (const product of storefrontProducts) {
    const id = e2eCategoryId(product.department);
    const current = categoryCounts.get(id);
    categoryCounts.set(id, { name: product.department, count: (current?.count ?? 0) + 1 });
  }

  return Array.from(categoryCounts, ([id, category]) => ({
    id,
    name: category.name,
    path: category.name,
    parentCategoryId: null,
    itemCount: category.count,
    variationCount: category.count
  })).sort((first, second) => first.name.localeCompare(second.name));
}

function e2eAdminCatalogSummary(): SquareCatalogCacheSummary {
  const categories = new Set(storefrontProducts.map((product) => e2eCategoryId(product.department)));
  const vendors = new Set(storefrontProducts.flatMap((product) => product.squareVendorIds ?? []));

  return {
    available: true,
    environment: "sandbox",
    status: "completed",
    hasMore: false,
    pagesCompleted: 1,
    itemCount: storefrontProducts.length,
    variationCount: storefrontProducts.length,
    imageCount: storefrontProducts.filter((product) => product.imageUrl.trim()).length,
    categoryCount: categories.size,
    vendorCount: vendors.size,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function e2eCategoryId(department: string) {
  return `e2e-${department.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function usesE2eCatalogFixture() {
  return process.env.E2E_CATALOG_FIXTURE === "true";
}

function catalogFromWhere(query: ReturnType<typeof normalizeQuery>) {
  const filters: Prisma.Sql[] = [
    Prisma.sql`variation."deletedAt" IS NULL`,
    Prisma.sql`item."deletedAt" IS NULL`,
    Prisma.sql`item."type" = 'ITEM'`
  ];

  if (query.query) {
    const pattern = `%${query.query}%`;
    filters.push(Prisma.sql`(
      variation."id" ILIKE ${pattern}
      OR variation."name" ILIKE ${pattern}
      OR COALESCE(variation."sku", '') ILIKE ${pattern}
      OR COALESCE(variation."upc", '') ILIKE ${pattern}
      OR COALESCE(item."name", '') ILIKE ${pattern}
    )`);
  }

  if (query.categoryId) {
    filters.push(Prisma.sql`${query.categoryId} = ANY(item."categoryIds")`);
  }

  if (query.vendorId) {
    filters.push(Prisma.sql`FALSE`);
  }

  if (query.variationIds !== undefined) {
    filters.push(query.variationIds.length
      ? Prisma.sql`variation."id" IN (${Prisma.join(query.variationIds)})`
      : Prisma.sql`FALSE`);
  }

  if (query.imageFilter !== "all") {
    const hasImage = Prisma.sql`(
      NULLIF(variation."raw"->>'imageId', '') IS NOT NULL
      OR jsonb_array_length(
        CASE
          WHEN jsonb_typeof(variation."raw"->'itemVariationData'->'imageIds') = 'array'
            THEN variation."raw"->'itemVariationData'->'imageIds'
          ELSE '[]'::jsonb
        END
      ) > 0
      OR NULLIF(item."raw"->>'imageId', '') IS NOT NULL
      OR jsonb_array_length(
        CASE
          WHEN jsonb_typeof(item."raw"->'itemData'->'imageIds') = 'array'
            THEN item."raw"->'itemData'->'imageIds'
          ELSE '[]'::jsonb
        END
      ) > 0
    )`;
    filters.push(query.imageFilter === "with" ? hasImage : Prisma.sql`NOT ${hasImage}`);
  }

  return Prisma.sql`
    FROM "SquareItemVariation" variation
    INNER JOIN "SquareCatalogObject" item
      ON item."id" = variation."itemId"
    WHERE ${Prisma.join(filters, " AND ")}
  `;
}

function normalizeQuery(options: CatalogQuery) {
  return {
    query: options.query?.trim().slice(0, 100) ?? "",
    categoryId: options.categoryId?.trim().slice(0, 160) ?? "",
    vendorId: options.vendorId?.trim().slice(0, 160) ?? "",
    imageFilter: normalizeImageFilter(options.imageFilter),
    variationIds: normalizeVariationIds(options.variationIds),
    pageSize: clampInteger(options.pageSize, 24, 12, 100),
    page: clampInteger(options.page, 1, 1, 100_000)
  };
}

function normalizeVariationIds(values: string[] | undefined) {
  if (values === undefined) return undefined;
  return Array.from(new Set(values.map((id) => id.trim().slice(0, 160)).filter(Boolean))).slice(0, 50_000);
}

function normalizeImageFilter(value: PostgresCatalogImageFilter | undefined): PostgresCatalogImageFilter {
  return value === "with" || value === "without" ? value : "all";
}

function safeCount(value: bigint | number | string | undefined) {
  const numeric = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function clampInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value as number)));
}
