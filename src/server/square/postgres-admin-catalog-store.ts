import "server-only";

import { Prisma } from "@prisma/client";
import type {
  SquareCatalogCacheSummary,
  SquareCatalogCategorySummary
} from "@/features/catalog/square-catalog-cache";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import {
  readPostgresCatalogSummary,
  readPostgresStorefrontProductsByVariationIds
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
  const normalized = normalizeQuery(options);
  const prisma = getPrismaClient();
  const fromWhere = catalogFromWhere(normalized);

  try {
    const [countRows, summary] = await Promise.all([
      prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS total ${fromWhere}`),
      readPostgresAdminCatalogSummary()
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
  const normalized = normalizeQuery(options);
  const safeLimit = clampInteger(limit, 5_000, 1, 5_000);
  const prisma = getPrismaClient();
  const fromWhere = catalogFromWhere(normalized);

  try {
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
  try {
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
  try {
    const [catalog, objectCounts] = await Promise.all([
      readPostgresCatalogSummary(),
      getPrismaClient().squareCatalogObject.groupBy({
        by: ["type"],
        where: { deletedAt: null, type: { in: ["IMAGE", "CATEGORY"] } },
        _count: { _all: true }
      })
    ]);
    const countByType = new Map(objectCounts.map((entry) => [entry.type, entry._count._all]));

    return {
      available: catalog.available,
      environment: catalog.environment === "production" || catalog.environment === "sandbox" ? catalog.environment : null,
      status: catalog.available ? "completed" : "unavailable",
      hasMore: false,
      pagesCompleted: 0,
      itemCount: catalog.itemCount,
      variationCount: catalog.variationCount,
      imageCount: countByType.get("IMAGE") ?? 0,
      categoryCount: countByType.get("CATEGORY") ?? 0,
      vendorCount: 0,
      updatedAt: catalog.updatedAt
    };
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("PostgreSQL admin catalog summary", { cause: error });
  }
}

export async function readPostgresAdminProductsByVariationIds(variationIds: string[]) {
  return readPostgresStorefrontProductsByVariationIds(variationIds);
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
