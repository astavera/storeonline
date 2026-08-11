/**
 * Implements server-side catalog test cache store behavior and persistence boundaries.
 */

import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  SquareCatalogCategorySummary,
  SquareCatalogCachePage,
  SquareCatalogCacheProduct,
  SquareCatalogCacheSummary
} from "@/features/catalog/square-catalog-cache";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { canonicalizeGtin } from "@/features/catalog/services/brand-gtin-import-service";
import type { SquareVendorReference } from "@/server/square/read-only-catalog";

const cachePath = resolve(process.cwd(), "data", "square-catalog-test.sqlite");

type CacheQuery = {
  categoryId?: string;
  imageFilter?: SquareCatalogImageFilter;
  page?: number;
  pageSize?: number;
  query?: string;
  variationIds?: string[];
  vendorId?: string;
};

export type SquareCatalogImageFilter = "all" | "with" | "without";

export type SquareStorefrontCatalogPage = {
  products: StorefrontProduct[];
  summary: SquareCatalogCacheSummary;
  query: string;
  categoryId: string;
  vendorId: string;
  imageFilter: SquareCatalogImageFilter;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

export type SquareStorefrontVariationSelection = {
  variationIds: string[];
  total: number;
  truncated: boolean;
  query: string;
  categoryId: string;
  vendorId: string;
  imageFilter: SquareCatalogImageFilter;
};

type SqlRow = Record<string, null | number | bigint | string | Uint8Array>;

export type SquareGtinVariationMatch = {
  canonicalGtin: string;
  gtin: string;
  itemName: string;
  variationId: string;
  variationName: string;
};

export function readSquareCatalogCachePage(options: CacheQuery = {}): SquareCatalogCachePage {
  const query = options.query?.trim().slice(0, 100) ?? "";
  const categoryId = options.categoryId?.trim().slice(0, 160) ?? "";
  const pageSize = clampInteger(options.pageSize, 24, 12, 100);
  const requestedPage = clampInteger(options.page, 1, 1, 100_000);

  if (!existsSync(cachePath)) {
    return {
      summary: unavailableSummary(),
      products: [],
      query,
      page: 1,
      pageSize,
      pageCount: 0,
      total: 0
    };
  }

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });

  try {
    const summary = readSummary(db);
    const pattern = `%${escapeLike(query)}%`;
    const filters: string[] = [];
    const filterParameters: string[] = [];

    if (query) {
      filters.push(`(
          i.name LIKE ? ESCAPE '\\' COLLATE NOCASE
          OR EXISTS (
            SELECT 1 FROM catalog_variations search_v
            WHERE search_v.item_id = i.id AND search_v.deleted_at IS NULL
              AND (search_v.name LIKE ? ESCAPE '\\' COLLATE NOCASE
                OR search_v.sku LIKE ? ESCAPE '\\' COLLATE NOCASE
                OR search_v.upc LIKE ? ESCAPE '\\' COLLATE NOCASE)
          )
        )`);
      filterParameters.push(pattern, pattern, pattern, pattern);
    }

    if (categoryId) {
      filters.push(`EXISTS (
        SELECT 1 FROM catalog_item_categories category_filter
        WHERE category_filter.item_id = i.id AND category_filter.category_id = ?
      )`);
      filterParameters.push(categoryId);
      filters.push("i.is_archived = 0");
      filters.push(`EXISTS (
        SELECT 1 FROM catalog_variations sellable_variation
        WHERE sellable_variation.item_id = i.id
          AND sellable_variation.deleted_at IS NULL
          AND sellable_variation.sellable = 1
      )`);
    }

    const filterClause = filters.length ? `AND ${filters.join(" AND ")}` : "";
    const sellableVariationClause = categoryId ? "AND variation_count.sellable = 1" : "";
    const sellableFirstVariationClause = categoryId ? "AND first_variation.sellable = 1" : "";
    const totalRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_items i
      WHERE i.deleted_at IS NULL ${filterClause}
    `).get(...filterParameters) as SqlRow;
    const total = Number(totalRow.count ?? 0);
    const pageCount = total ? Math.ceil(total / pageSize) : 0;
    const page = pageCount ? Math.min(requestedPage, pageCount) : 1;
    const offset = (page - 1) * pageSize;

    const rows = db.prepare(`
      SELECT
        i.id,
        i.name,
        i.description_plaintext,
        i.is_archived,
        fv.id AS variation_id,
        fv.name AS variation_name,
        fv.sku,
        fv.upc,
        fv.price_amount,
        fv.currency,
        fv.track_inventory,
        (
          SELECT COUNT(*) FROM catalog_variations variation_count
          WHERE variation_count.item_id = i.id AND variation_count.deleted_at IS NULL ${sellableVariationClause}
        ) AS variation_count,
        COALESCE(
          (
            SELECT image.url
            FROM catalog_item_images item_image
            JOIN catalog_images image ON image.id = item_image.image_id AND image.deleted_at IS NULL
            WHERE item_image.item_id = i.id AND image.url IS NOT NULL
            ORDER BY item_image.sort_order LIMIT 1
          ),
          (
            SELECT image.url
            FROM catalog_variations image_variation
            JOIN catalog_variation_images variation_image ON variation_image.variation_id = image_variation.id
            JOIN catalog_images image ON image.id = variation_image.image_id AND image.deleted_at IS NULL
            WHERE image_variation.item_id = i.id AND image_variation.deleted_at IS NULL AND image.url IS NOT NULL
            ORDER BY image_variation.rowid, variation_image.sort_order LIMIT 1
          )
        ) AS image_url,
        (
          SELECT GROUP_CONCAT(category.name, char(31))
          FROM catalog_item_categories item_category
          JOIN catalog_categories category ON category.id = item_category.category_id AND category.deleted_at IS NULL
          WHERE item_category.item_id = i.id
          ORDER BY item_category.sort_order
        ) AS category_names
      FROM catalog_items i
      LEFT JOIN catalog_variations fv ON fv.id = (
        SELECT first_variation.id FROM catalog_variations first_variation
        WHERE first_variation.item_id = i.id AND first_variation.deleted_at IS NULL
          ${sellableFirstVariationClause}
        ORDER BY first_variation.rowid LIMIT 1
      )
      WHERE i.deleted_at IS NULL ${filterClause}
      ORDER BY i.name COLLATE NOCASE, i.id
      LIMIT ? OFFSET ?
    `).all(...filterParameters, pageSize, offset) as SqlRow[];

    return {
      summary,
      products: rows.map(mapProduct),
      query,
      page,
      pageSize,
      pageCount,
      total
    };
  } finally {
    db.close();
  }
}

export function readSquareStorefrontCatalogPage(options: CacheQuery = {}): SquareStorefrontCatalogPage {
  const query = options.query?.trim().slice(0, 100) ?? "";
  const categoryId = options.categoryId?.trim().slice(0, 160) ?? "";
  const vendorId = options.vendorId?.trim().slice(0, 160) ?? "";
  const imageFilter = normalizeImageFilter(options.imageFilter);
  const variationIdFilter = normalizeVariationIdFilter(options.variationIds);
  const pageSize = clampInteger(options.pageSize, 24, 12, 100);
  const requestedPage = clampInteger(options.page, 1, 1, 100_000);

  if (!existsSync(cachePath)) {
    return {
      products: [],
      summary: unavailableSummary(),
      query,
      categoryId,
      vendorId,
      imageFilter,
      page: 1,
      pageSize,
      pageCount: 0,
      total: 0
    };
  }

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });
  let summary = unavailableSummary();
  let page = 1;
  let pageCount = 0;
  let total = 0;
  let variationIds: string[] = [];

  try {
    summary = readSummary(db);
    const { parameters, whereClause } = buildStorefrontVariationFilter(
      query,
      categoryId,
      vendorId,
      imageFilter,
      variationIdFilter,
      hasTable(db, "catalog_variation_vendors")
    );
    const totalRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_variations variation
      JOIN catalog_items item ON item.id = variation.item_id
      WHERE ${whereClause}
    `).get(...parameters) as SqlRow;
    total = Number(totalRow.count ?? 0);
    pageCount = total ? Math.ceil(total / pageSize) : 0;
    page = pageCount ? Math.min(requestedPage, pageCount) : 1;
    const offset = (page - 1) * pageSize;
    const rows = db.prepare(`
      SELECT variation.id
      FROM catalog_variations variation
      JOIN catalog_items item ON item.id = variation.item_id
      WHERE ${whereClause}
      ORDER BY item.name COLLATE NOCASE, item.id, variation.rowid
      LIMIT ? OFFSET ?
    `).all(...parameters, pageSize, offset) as SqlRow[];
    variationIds = rows.map((row) => text(row.id)).filter((id): id is string => Boolean(id));
  } finally {
    db.close();
  }

  return {
    products: readSquareStorefrontProductsByVariationIds(variationIds),
    summary,
    query,
    categoryId,
    vendorId,
    imageFilter,
    page,
    pageSize,
    pageCount,
    total
  };
}

export function readSquareStorefrontVariationSelection(
  options: CacheQuery = {},
  limit = 5_000
): SquareStorefrontVariationSelection {
  const query = options.query?.trim().slice(0, 100) ?? "";
  const categoryId = options.categoryId?.trim().slice(0, 160) ?? "";
  const vendorId = options.vendorId?.trim().slice(0, 160) ?? "";
  const imageFilter = normalizeImageFilter(options.imageFilter);
  const variationIdFilter = normalizeVariationIdFilter(options.variationIds);
  const safeLimit = clampInteger(limit, 5_000, 1, 5_000);

  if (!existsSync(cachePath)) {
    return { variationIds: [], total: 0, truncated: false, query, categoryId, vendorId, imageFilter };
  }

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });

  try {
    const { parameters, whereClause } = buildStorefrontVariationFilter(
      query,
      categoryId,
      vendorId,
      imageFilter,
      variationIdFilter,
      hasTable(db, "catalog_variation_vendors")
    );
    const totalRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_variations variation
      JOIN catalog_items item ON item.id = variation.item_id
      WHERE ${whereClause}
    `).get(...parameters) as SqlRow;
    const total = Number(totalRow.count ?? 0);
    const rows = db.prepare(`
      SELECT variation.id
      FROM catalog_variations variation
      JOIN catalog_items item ON item.id = variation.item_id
      WHERE ${whereClause}
      ORDER BY item.name COLLATE NOCASE, item.id, variation.rowid
      LIMIT ?
    `).all(...parameters, safeLimit) as SqlRow[];
    const variationIds = rows.map((row) => text(row.id)).filter((id): id is string => Boolean(id));

    return { variationIds, total, truncated: total > variationIds.length, query, categoryId, vendorId, imageFilter };
  } finally {
    db.close();
  }
}

export function readSquareCatalogCacheSummary(): SquareCatalogCacheSummary {
  if (!existsSync(cachePath)) return unavailableSummary();

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });
  try {
    return readSummary(db);
  } finally {
    db.close();
  }
}

export function readSquareCatalogCategories(): SquareCatalogCategorySummary[] {
  if (!existsSync(cachePath)) return [];

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });

  try {
    const rows = db.prepare(`
      SELECT
        category.id,
        category.name,
        category.parent_category_id,
        COUNT(DISTINCT item_category.item_id) AS item_count,
        COUNT(DISTINCT variation.id) AS variation_count
      FROM catalog_categories category
      JOIN catalog_item_categories item_category ON item_category.category_id = category.id
      JOIN catalog_items item ON item.id = item_category.item_id AND item.deleted_at IS NULL AND item.is_archived = 0
      JOIN catalog_variations variation ON variation.item_id = item.id AND variation.deleted_at IS NULL AND variation.sellable = 1
      WHERE category.deleted_at IS NULL
      GROUP BY category.id, category.name, category.parent_category_id
      HAVING COUNT(DISTINCT item_category.item_id) > 0
      ORDER BY category.name COLLATE NOCASE, category.id
    `).all() as SqlRow[];
    const categoryById = new Map(rows.map((row) => [text(row.id) ?? "", { name: text(row.name) ?? "Unnamed category", parentCategoryId: text(row.parent_category_id) }]));

    return rows.map((row) => {
      const id = text(row.id) ?? "";
      const category = categoryById.get(id);
      return {
        id,
        name: category?.name ?? "Unnamed category",
        path: buildCategoryPath(id, categoryById),
        parentCategoryId: category?.parentCategoryId ?? null,
        itemCount: Number(row.item_count ?? 0),
        variationCount: Number(row.variation_count ?? 0)
      };
    }).sort((left, right) => left.path.localeCompare(right.path) || left.id.localeCompare(right.id));
  } finally {
    db.close();
  }
}

export function readSquareVendorsFromCatalogCache(): SquareVendorReference[] {
  if (!existsSync(cachePath)) return [];

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });

  try {
    const rows = db.prepare(`
      SELECT id, name, status
      FROM square_vendors
      WHERE deleted_at IS NULL AND status <> 'INACTIVE'
      ORDER BY name COLLATE NOCASE, id
    `).all() as SqlRow[];

    return rows.map((row) => ({
      id: text(row.id) ?? "",
      name: text(row.name) ?? "Unnamed vendor",
      status: text(row.status) ?? "UNKNOWN"
    })).filter((vendor) => Boolean(vendor.id));
  } finally {
    db.close();
  }
}

export function readSquareVariationIdsByCategory(categoryId: string): string[] {
  const normalizedCategoryId = categoryId.trim().slice(0, 160);
  if (!normalizedCategoryId || !existsSync(cachePath)) return [];

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });

  try {
    const rows = db.prepare(`
      SELECT DISTINCT variation.id
      FROM catalog_item_categories item_category
      JOIN catalog_items item ON item.id = item_category.item_id AND item.deleted_at IS NULL AND item.is_archived = 0
      JOIN catalog_variations variation ON variation.item_id = item.id AND variation.deleted_at IS NULL AND variation.sellable = 1
      WHERE item_category.category_id = ?
      ORDER BY variation.id
    `).all(normalizedCategoryId) as SqlRow[];

    return rows.map((row) => text(row.id)).filter((id): id is string => Boolean(id));
  } finally {
    db.close();
  }
}

export function readSquareVariationIdsByItemIds(itemIds: string[]): Record<string, string[]> {
  const normalizedItemIds = Array.from(new Set(itemIds.map((id) => id.trim().slice(0, 160)).filter(Boolean))).slice(0, 100);
  const variationIdsByItem: Record<string, string[]> = Object.fromEntries(normalizedItemIds.map((id) => [id, []]));
  if (normalizedItemIds.length === 0 || !existsSync(cachePath)) return variationIdsByItem;

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });

  try {
    const placeholders = normalizedItemIds.map(() => "?").join(", ");
    const rows = db.prepare(`
      SELECT item_id, id
      FROM catalog_variations
      WHERE item_id IN (${placeholders})
        AND deleted_at IS NULL
        AND sellable = 1
      ORDER BY item_id, rowid
    `).all(...normalizedItemIds) as SqlRow[];

    for (const row of rows) {
      const itemId = text(row.item_id);
      const variationId = text(row.id);
      if (itemId && variationId && variationIdsByItem[itemId]) variationIdsByItem[itemId].push(variationId);
    }

    return variationIdsByItem;
  } finally {
    db.close();
  }
}

export function readSquareVariationsByCanonicalGtins(canonicalGtins: string[]): SquareGtinVariationMatch[] {
  const requestedGtins = new Set(canonicalGtins);
  if (requestedGtins.size === 0 || !existsSync(cachePath)) return [];

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });

  try {
    const rows = db.prepare(`
      SELECT
        variation.id AS variation_id,
        variation.name AS variation_name,
        variation.upc,
        item.name AS item_name
      FROM catalog_variations variation
      JOIN catalog_items item ON item.id = variation.item_id
      WHERE variation.deleted_at IS NULL
        AND variation.sellable = 1
        AND variation.upc IS NOT NULL
        AND trim(variation.upc) <> ''
        AND item.deleted_at IS NULL
        AND item.is_archived = 0
      ORDER BY item.name COLLATE NOCASE, variation.rowid
    `).all() as SqlRow[];

    return rows.flatMap((row) => {
      const variationId = text(row.variation_id);
      const gtin = text(row.upc);
      const canonicalGtin = gtin ? canonicalizeGtin(gtin) : null;
      if (!variationId || !gtin || !canonicalGtin || !requestedGtins.has(canonicalGtin)) return [];

      return [{
        canonicalGtin,
        gtin,
        itemName: text(row.item_name) ?? "Unnamed item",
        variationId,
        variationName: text(row.variation_name) ?? "Default"
      }];
    });
  } finally {
    db.close();
  }
}

export function readSquareStorefrontProductsByVariationIds(variationIds: string[]): StorefrontProduct[] {
  const normalizedVariationIds = Array.from(new Set(variationIds.map((id) => id.trim().slice(0, 160)).filter(Boolean))).slice(0, 100_000);
  if (normalizedVariationIds.length === 0 || !existsSync(cachePath)) return [];

  const db = new DatabaseSync(cachePath, { readOnly: true, timeout: 5_000 });

  try {
    const productByVariationId = new Map<string, StorefrontProduct>();

    for (let offset = 0; offset < normalizedVariationIds.length; offset += 400) {
      const batch = normalizedVariationIds.slice(offset, offset + 400);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = db.prepare(`
        SELECT
          variation.id AS variation_id,
          variation.item_id,
          variation.name AS variation_name,
          variation.price_amount,
          variation.track_inventory,
          item.name AS item_name,
          item.description_plaintext,
          COALESCE(
            (
              SELECT image.url
              FROM catalog_variation_images variation_image
              JOIN catalog_images image ON image.id = variation_image.image_id AND image.deleted_at IS NULL
              WHERE variation_image.variation_id = variation.id AND image.url IS NOT NULL
              ORDER BY variation_image.sort_order LIMIT 1
            ),
            (
              SELECT image.url
              FROM catalog_item_images item_image
              JOIN catalog_images image ON image.id = item_image.image_id AND image.deleted_at IS NULL
              WHERE item_image.item_id = item.id AND image.url IS NOT NULL
              ORDER BY item_image.sort_order LIMIT 1
            )
          ) AS image_url,
          (
            SELECT category.name
            FROM catalog_item_categories item_category
            JOIN catalog_categories category ON category.id = item_category.category_id AND category.deleted_at IS NULL
            WHERE item_category.item_id = item.id
            ORDER BY item_category.sort_order LIMIT 1
          ) AS category_name,
          (
            SELECT GROUP_CONCAT(vendor.id, char(31))
            FROM catalog_variation_vendors variation_vendor
            JOIN square_vendors vendor ON vendor.id = variation_vendor.vendor_id AND vendor.deleted_at IS NULL
            WHERE variation_vendor.variation_id = variation.id
          ) AS vendor_ids,
          (
            SELECT GROUP_CONCAT(vendor.name, char(31))
            FROM catalog_variation_vendors variation_vendor
            JOIN square_vendors vendor ON vendor.id = variation_vendor.vendor_id AND vendor.deleted_at IS NULL
            WHERE variation_vendor.variation_id = variation.id
          ) AS vendor_names
        FROM catalog_variations variation
        JOIN catalog_items item ON item.id = variation.item_id
        WHERE variation.id IN (${placeholders})
          AND variation.deleted_at IS NULL
          AND variation.sellable = 1
          AND item.deleted_at IS NULL
          AND item.is_archived = 0
      `).all(...batch) as SqlRow[];

      for (const row of rows) {
        const variationId = text(row.variation_id);
        const itemId = text(row.item_id);
        if (!variationId || !itemId) continue;

        const itemName = text(row.item_name) ?? "Unnamed item";
        const variationName = text(row.variation_name) ?? "Default";
        const description = text(row.description_plaintext) ?? "Available from the read-only Square catalog.";
        const priceAmount = Number(text(row.price_amount) ?? 0);
        const displayName = /^(default|regular)$/i.test(variationName) ? itemName : `${itemName} - ${variationName}`;

        productByVariationId.set(variationId, {
          id: itemId,
          squareVariationId: variationId,
          slug: squareStorefrontSlug(itemName, variationId),
          name: displayName,
          department: text(row.category_name) ?? "Square catalog",
          shortDescription: description.slice(0, 180),
          description,
          imageUrl: text(row.image_url) ?? "/images/product-fallback.svg",
          priceCents: Number.isFinite(priceAmount) && priceAmount >= 0 ? Math.trunc(priceAmount) : 0,
          fulfillmentModes: [],
          inventoryStatus: Number(row.track_inventory ?? 0) === 1 ? "limited" : "in-stock",
          squareVendorIds: (text(row.vendor_ids) ?? "").split("\u001f").filter(Boolean),
          squareVendorNames: (text(row.vendor_names) ?? "").split("\u001f").filter(Boolean),
          previewOnly: true
        });
      }
    }

    return normalizedVariationIds.map((variationId) => productByVariationId.get(variationId)).filter((product): product is StorefrontProduct => Boolean(product));
  } finally {
    db.close();
  }
}

function buildStorefrontVariationFilter(
  query: string,
  categoryId: string,
  vendorId: string,
  imageFilter: SquareCatalogImageFilter,
  variationIds?: string[],
  vendorRelationsAvailable = true
) {
  const pattern = `%${escapeLike(query)}%`;
  const filters = [
    "variation.deleted_at IS NULL",
    "variation.sellable = 1",
    "item.deleted_at IS NULL",
    "item.is_archived = 0"
  ];
  const parameters: string[] = [];

  if (query) {
    filters.push(`(
      item.name LIKE ? ESCAPE '\\' COLLATE NOCASE
      OR variation.name LIKE ? ESCAPE '\\' COLLATE NOCASE
      OR variation.sku LIKE ? ESCAPE '\\' COLLATE NOCASE
      OR variation.upc LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`);
    parameters.push(pattern, pattern, pattern, pattern);
  }

  if (categoryId) {
    filters.push(`EXISTS (
      SELECT 1
      FROM catalog_item_categories category_filter
      WHERE category_filter.item_id = item.id
        AND category_filter.category_id = ?
    )`);
    parameters.push(categoryId);
  }

  if (vendorId) {
    if (!vendorRelationsAvailable) {
      filters.push("0 = 1");
    } else {
      filters.push(`EXISTS (
        SELECT 1
        FROM catalog_variation_vendors vendor_filter
        WHERE vendor_filter.variation_id = variation.id
          AND vendor_filter.vendor_id = ?
      )`);
      parameters.push(vendorId);
    }
  }

  if (variationIds) {
    if (variationIds.length === 0) {
      filters.push("0 = 1");
    } else {
      filters.push("variation.id IN (SELECT value FROM json_each(?))");
      parameters.push(JSON.stringify(variationIds));
    }
  }

  const hasImageClause = `(
    variation.id IN (
      SELECT variation_image_filter.variation_id
      FROM catalog_variation_images variation_image_filter
      JOIN catalog_images variation_image ON variation_image.id = variation_image_filter.image_id
      WHERE variation_image.deleted_at IS NULL
        AND variation_image.url IS NOT NULL
        AND trim(variation_image.url) <> ''
    )
    OR item.id IN (
      SELECT item_image_filter.item_id
      FROM catalog_item_images item_image_filter
      JOIN catalog_images item_image ON item_image.id = item_image_filter.image_id
      WHERE item_image.deleted_at IS NULL
        AND item_image.url IS NOT NULL
        AND trim(item_image.url) <> ''
    )
  )`;

  if (imageFilter === "with") filters.push(hasImageClause);
  if (imageFilter === "without") filters.push(`NOT ${hasImageClause}`);

  return { parameters, whereClause: filters.join(" AND ") };
}

function normalizeImageFilter(value: SquareCatalogImageFilter | undefined): SquareCatalogImageFilter {
  return value === "with" || value === "without" ? value : "all";
}

function normalizeVariationIdFilter(values: string[] | undefined) {
  if (values === undefined) return undefined;
  return Array.from(new Set(values.map((id) => id.trim().slice(0, 160)).filter(Boolean))).slice(0, 100_000);
}

function hasTable(db: DatabaseSync, tableName: string) {
  const row = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName) as SqlRow | undefined;
  return Number(row?.found ?? 0) === 1;
}

function readSummary(db: DatabaseSync): SquareCatalogCacheSummary {
  const run = db.prepare(`
    SELECT environment, status, next_cursor, pages_completed, updated_at
    FROM sync_runs ORDER BY started_at DESC LIMIT 1
  `).get() as SqlRow | undefined;
  const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE deleted_at IS NULL`).get() as SqlRow).count ?? 0);

  return {
    available: Boolean(run),
    environment: run?.environment === "production" ? "production" : run?.environment === "sandbox" ? "sandbox" : null,
    status: normalizeStatus(run?.status),
    hasMore: Boolean(run?.next_cursor),
    pagesCompleted: Number(run?.pages_completed ?? 0),
    itemCount: count("catalog_items"),
    variationCount: count("catalog_variations"),
    imageCount: count("catalog_images"),
    categoryCount: count("catalog_categories"),
    vendorCount: count("square_vendors"),
    updatedAt: typeof run?.updated_at === "string" ? run.updated_at : null
  };
}

function mapProduct(row: SqlRow): SquareCatalogCacheProduct {
  const variationId = text(row.variation_id);
  return {
    id: text(row.id) ?? "",
    name: text(row.name) ?? "Unnamed item",
    description: text(row.description_plaintext),
    isArchived: Number(row.is_archived ?? 0) === 1,
    variationCount: Number(row.variation_count ?? 0),
    imageUrl: text(row.image_url),
    categoryNames: (text(row.category_names) ?? "").split("\u001f").filter(Boolean),
    firstVariation: variationId
      ? {
          id: variationId,
          name: text(row.variation_name) ?? "Default",
          sku: text(row.sku),
          upc: text(row.upc),
          priceAmount: text(row.price_amount),
          currency: text(row.currency),
          trackInventory: Number(row.track_inventory ?? 0) === 1
        }
      : null
  };
}

function unavailableSummary(): SquareCatalogCacheSummary {
  return {
    available: false,
    environment: null,
    status: "unavailable",
    hasMore: false,
    pagesCompleted: 0,
    itemCount: 0,
    variationCount: 0,
    imageCount: 0,
    categoryCount: 0,
    vendorCount: 0,
    updatedAt: null
  };
}

function normalizeStatus(value: SqlRow[string] | undefined): SquareCatalogCacheSummary["status"] {
  return value === "running" || value === "partial" || value === "failed" || value === "completed" ? value : "unavailable";
}

function text(value: SqlRow[string] | undefined) {
  return typeof value === "string" && value ? value : null;
}

function clampInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value as number)));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function squareStorefrontSlug(itemName: string, variationId: string) {
  const base = itemName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "square-product";
  const suffix = variationId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "item";
  return `${base}-${suffix}`;
}

function buildCategoryPath(
  categoryId: string,
  categoryById: Map<string, { name: string; parentCategoryId: string | null }>
) {
  const names: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = categoryId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const current = categoryById.get(currentId);
    if (!current) break;
    names.unshift(current.name);
    currentId = current.parentCategoryId;
  }

  return names.join(" / ") || categoryById.get(categoryId)?.name || "Unnamed category";
}
