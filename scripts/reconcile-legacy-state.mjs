import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

loadEnvironment();

if (!process.env.DATABASE_URL) fail("DATABASE_URL is required for read-only reconciliation.");

const root = process.cwd();
const paths = {
  sqlite: resolve(root, "data", "square-catalog-test.sqlite"),
  merchandising: resolve(root, "data", "admin-merchandising.json"),
  preview: resolve(root, "data", "square-catalog-preview.json"),
  cmsShop: resolve(root, "data", "admin-cms", "cms-landing-shop.json"),
  cmsHomepage: resolve(root, "data", "admin-cms", "homepage.json")
};

const prisma = new PrismaClient({ log: ["error"] });

try {
  const legacy = readLegacyState(paths);
  const postgres = await readPostgresState(prisma);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    sources: legacy.sources,
    catalog: compareCatalog(legacy.catalog, postgres.catalog),
    merchandising: compareMerchandising(legacy.merchandising, postgres.merchandising),
    cms: compareCms(legacy.cms, postgres.cms),
    recommendation: "Do not import or delete legacy files until every missing/conflicting record has an approved resolution."
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect();
}

function readLegacyState(files) {
  const required = Object.entries(files).filter(([, path]) => !existsSync(path));
  if (required.length) fail(`Missing legacy sources: ${required.map(([name]) => name).join(", ")}`);
  const db = new DatabaseSync(files.sqlite, { readOnly: true });
  let catalog;
  try {
    catalog = {
      itemIds: readIds(db, "SELECT id FROM catalog_items WHERE deleted_at IS NULL"),
      variationIds: readIds(db, "SELECT id FROM catalog_variations WHERE deleted_at IS NULL"),
      imageIds: readIds(db, "SELECT id FROM catalog_images WHERE deleted_at IS NULL"),
      categoryIds: readIds(db, "SELECT id FROM catalog_categories WHERE deleted_at IS NULL")
    };
  } finally {
    db.close();
  }

  const merchandising = readJson(files.merchandising);
  const preview = readJson(files.preview);
  const cmsShop = readJson(files.cmsShop);
  const cmsHomepage = readJson(files.cmsHomepage);
  return {
    sources: Object.fromEntries(Object.entries(files).map(([name, path]) => [name, {
      path: relativePath(path),
      sha256: sha256(readFileSync(path)),
      bytes: readFileSync(path).byteLength
    }])),
    catalog,
    merchandising: {
      categoryIds: strings((merchandising.categories ?? []).map((entry) => entry.id)),
      brandIds: strings((merchandising.brands ?? []).map((entry) => entry.id)),
      holidayIds: strings((merchandising.holidays ?? []).map((entry) => entry.id)),
      variationIds: strings((merchandising.placements ?? []).map((entry) => entry.squareVariationId)),
      previewVariationIds: strings((preview.products ?? []).map((entry) => entry.squareVariationId))
    },
    cms: [...normalizeCmsRows(cmsShop), ...normalizeCmsRows(cmsHomepage)]
  };
}

async function readPostgresState(database) {
  const [items, variations, images, categories, overrides, cmsVersions] = await Promise.all([
    database.squareCatalogObject.findMany({ where: { type: "ITEM", deletedAt: null }, select: { id: true } }),
    database.squareItemVariation.findMany({ select: { id: true } }),
    database.squareCatalogObject.findMany({ where: { type: "IMAGE", deletedAt: null }, select: { id: true } }),
    database.squareCatalogObject.findMany({ where: { type: "CATEGORY", deletedAt: null }, select: { id: true } }),
    database.productOverride.findMany({ select: { squareVariationId: true } }),
    database.cmsContentVersion.findMany({
      orderBy: [{ entityType: "asc" }, { entityId: "asc" }, { versionNumber: "desc" }],
      select: { entityType: true, entityId: true, versionNumber: true, status: true }
    })
  ]);
  return {
    catalog: {
      itemIds: strings(items.map((entry) => entry.id)),
      variationIds: strings(variations.map((entry) => entry.id)),
      imageIds: strings(images.map((entry) => entry.id)),
      categoryIds: strings(categories.map((entry) => entry.id))
    },
    merchandising: { variationIds: strings(overrides.map((entry) => entry.squareVariationId)) },
    cms: cmsVersions.map((entry) => ({
      key: `${entry.entityType}:${entry.entityId}`,
      versionNumber: entry.versionNumber,
      status: entry.status
    }))
  };
}

function compareCatalog(legacy, postgres) {
  return {
    items: compareIds(legacy.itemIds, postgres.itemIds),
    variations: compareIds(legacy.variationIds, postgres.variationIds),
    images: compareIds(legacy.imageIds, postgres.imageIds),
    categories: compareIds(legacy.categoryIds, postgres.categoryIds)
  };
}

function compareMerchandising(legacy, postgres) {
  return {
    legacyCounts: {
      categories: legacy.categoryIds.length,
      brands: legacy.brandIds.length,
      holidays: legacy.holidayIds.length,
      placements: legacy.variationIds.length,
      previewProducts: legacy.previewVariationIds.length
    },
    productOverrides: compareIds(legacy.variationIds, postgres.variationIds),
    placementsWithoutLegacyCatalogVariation: difference(legacy.variationIds, new Set(legacy.previewVariationIds)).slice(0, 25)
  };
}

function compareCms(legacy, postgres) {
  const postgresKeys = new Set(postgres.map((entry) => entry.key));
  return {
    legacyDocuments: legacy,
    postgresVersions: postgres,
    legacyDocumentsMissingInPostgres: legacy.filter((entry) => !postgresKeys.has(entry.key)).map((entry) => entry.key)
  };
}

function compareIds(legacyIds, postgresIds) {
  const legacy = new Set(legacyIds);
  const postgres = new Set(postgresIds);
  const missing = difference(legacyIds, postgres);
  const unexpected = difference(postgresIds, legacy);
  return {
    legacy: legacy.size,
    postgres: postgres.size,
    matching: legacyIds.filter((id) => postgres.has(id)).length,
    missingInPostgres: missing.length,
    unexpectedInPostgres: unexpected.length,
    missingSample: missing.slice(0, 25),
    unexpectedSample: unexpected.slice(0, 25)
  };
}

function normalizeCmsRows(value) {
  return (Array.isArray(value) ? value : []).map((entry) => ({
    key: `${entry.entityType}:${entry.entityId}`,
    status: entry.status ?? "DRAFT",
    title: entry.title ?? null
  }));
}

function readIds(db, sql) {
  return strings(db.prepare(sql).all().map((row) => row.id));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function strings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))).sort();
}

function difference(values, comparison) {
  return values.filter((value) => !comparison.has(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function relativePath(path) {
  return path.slice(root.length + 1).replaceAll("\\", "/");
}

function loadEnvironment() {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(process.cwd(), name);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
