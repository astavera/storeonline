import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SquareClient, SquareEnvironment } from "square";

const CATALOG_TYPES = "ITEM,IMAGE,CATEGORY";
const DATABASE_PATH = resolve(process.cwd(), "data", "square-catalog-test.sqlite");
const args = parseArguments(process.argv.slice(2));

loadLocalEnvironment();

const environment = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
const accessToken = process.env.SQUARE_ACCESS_TOKEN?.trim();

if (!accessToken) {
  fail("SQUARE_ACCESS_TOKEN is missing. Add it to .env.local before running the catalog sync.");
}

if (environment === "production" && !args.confirmProductionReadOnly) {
  fail("Production catalog access requires --confirm-production-read-only. This command never writes to Square.");
}

mkdirSync(dirname(DATABASE_PATH), { recursive: true });

const db = new DatabaseSync(DATABASE_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
createSchema(db);

const client = new SquareClient({
  token: accessToken,
  environment: environment === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  timeoutInSeconds: 45,
  maxRetries: 4
});

const run = openSyncRun(db, {
  environment,
  restart: args.restart,
  types: CATALOG_TYPES
});

let cursor = run.nextCursor;
let pagesProcessedThisInvocation = 0;

console.log(JSON.stringify({
  event: run.resumed ? "sync_resumed" : "sync_started",
  environment,
  mode: "read_only",
  database: "data/square-catalog-test.sqlite",
  runId: run.id,
  pagesAlreadyCompleted: run.pagesCompleted,
  pageLimit: args.allPages ? "all" : args.maxPages
}));

try {
  while (args.allPages || pagesProcessedThisInvocation < args.maxPages) {
    const page = await client.catalog.list({
      types: CATALOG_TYPES,
      ...(cursor ? { cursor } : {})
    });
    const nextCursor = page.response.cursor?.trim() || null;
    const pageCounts = persistCatalogPage(db, page.data, run.id);

    pagesProcessedThisInvocation += 1;
    cursor = nextCursor;
    checkpointRun(db, run.id, nextCursor, pageCounts);

    const progress = readRun(db, run.id);
    console.log(JSON.stringify({
      event: "page_saved",
      page: progress.pagesCompleted,
      pageObjects: page.data.length,
      items: progress.itemsSeen,
      variations: progress.variationsSeen,
      images: progress.imagesSeen,
      categories: progress.categoriesSeen,
      hasMore: Boolean(nextCursor)
    }));

    if (!nextCursor) break;
  }

  await syncVendorsReadOnly(db, client, run.id);

  if (cursor) {
    markRunPartial(db, run.id);
  } else {
    finalizeRun(db, run.id);
  }

  const summary = readCatalogSummary(db);
  console.log(JSON.stringify({
    event: cursor ? "sync_paused" : "sync_completed",
    environment,
    mode: "read_only",
    hasMore: Boolean(cursor),
    ...summary
  }));
} catch (error) {
  markRunFailed(db, run.id, error);
  console.error(JSON.stringify({
    event: "sync_failed",
    runId: run.id,
    message: error instanceof Error ? error.message : "Unknown Square catalog sync error"
  }));
  process.exitCode = 1;
} finally {
  db.close();
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      environment TEXT NOT NULL,
      catalog_types TEXT NOT NULL,
      status TEXT NOT NULL,
      next_cursor TEXT,
      pages_completed INTEGER NOT NULL DEFAULT 0,
      objects_seen INTEGER NOT NULL DEFAULT 0,
      items_seen INTEGER NOT NULL DEFAULT 0,
      variations_seen INTEGER NOT NULL DEFAULT 0,
      images_seen INTEGER NOT NULL DEFAULT 0,
      categories_seen INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      buyer_facing_name TEXT,
      description_plaintext TEXT,
      description_html TEXT,
      product_type TEXT,
      reporting_category_id TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      present_at_all_locations INTEGER NOT NULL DEFAULT 1,
      present_at_location_ids TEXT NOT NULL DEFAULT '[]',
      absent_at_location_ids TEXT NOT NULL DEFAULT '[]',
      channels TEXT NOT NULL DEFAULT '[]',
      square_version TEXT,
      square_updated_at TEXT,
      last_seen_run_id TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS catalog_variations (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      upc TEXT,
      price_amount TEXT,
      currency TEXT,
      pricing_type TEXT,
      track_inventory INTEGER NOT NULL DEFAULT 0,
      sellable INTEGER NOT NULL DEFAULT 1,
      stockable INTEGER NOT NULL DEFAULT 0,
      present_at_all_locations INTEGER NOT NULL DEFAULT 1,
      present_at_location_ids TEXT NOT NULL DEFAULT '[]',
      absent_at_location_ids TEXT NOT NULL DEFAULT '[]',
      sold_out_location_ids TEXT NOT NULL DEFAULT '[]',
      square_version TEXT,
      square_updated_at TEXT,
      last_seen_run_id TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS catalog_images (
      id TEXT PRIMARY KEY,
      name TEXT,
      url TEXT,
      caption TEXT,
      square_version TEXT,
      square_updated_at TEXT,
      last_seen_run_id TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS catalog_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_category_id TEXT,
      root_category_id TEXT,
      is_top_level INTEGER NOT NULL DEFAULT 0,
      online_visibility INTEGER,
      square_version TEXT,
      square_updated_at TEXT,
      last_seen_run_id TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS catalog_item_categories (
      item_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (item_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS catalog_item_images (
      item_id TEXT NOT NULL,
      image_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (item_id, image_id)
    );

    CREATE TABLE IF NOT EXISTS catalog_variation_images (
      variation_id TEXT NOT NULL,
      image_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (variation_id, image_id)
    );

    CREATE TABLE IF NOT EXISTS square_vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      square_version INTEGER,
      square_updated_at TEXT,
      last_seen_run_id TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS catalog_items_name_idx ON catalog_items(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_variations_item_idx ON catalog_variations(item_id);
    CREATE INDEX IF NOT EXISTS catalog_variations_sku_idx ON catalog_variations(sku COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_variations_upc_idx ON catalog_variations(upc);
    CREATE INDEX IF NOT EXISTS catalog_item_categories_category_idx ON catalog_item_categories(category_id);
  `);
}

function openSyncRun(database, { environment: targetEnvironment, restart, types }) {
  const resumable = restart
    ? undefined
    : database.prepare(`
        SELECT * FROM sync_runs
        WHERE environment = ? AND catalog_types = ? AND status IN ('running', 'partial', 'failed')
        ORDER BY started_at DESC LIMIT 1
      `).get(targetEnvironment, types);

  if (resumable) {
    database.prepare(`
      UPDATE sync_runs
      SET status = 'running', updated_at = ?, finished_at = NULL, error_message = NULL
      WHERE id = ?
    `).run(now(), resumable.id);
    return {
      id: resumable.id,
      nextCursor: resumable.next_cursor || null,
      pagesCompleted: Number(resumable.pages_completed),
      resumed: true
    };
  }

  const id = crypto.randomUUID();
  const timestamp = now();
  database.prepare(`
    INSERT INTO sync_runs (id, environment, catalog_types, status, started_at, updated_at)
    VALUES (?, ?, ?, 'running', ?, ?)
  `).run(id, targetEnvironment, types, timestamp, timestamp);
  return { id, nextCursor: null, pagesCompleted: 0, resumed: false };
}

function persistCatalogPage(database, objects, runId) {
  const counts = { objects: objects.length, items: 0, variations: 0, images: 0, categories: 0 };
  const timestamp = now();
  const statements = prepareCatalogStatements(database);

  database.exec("BEGIN IMMEDIATE");
  try {
    for (const object of objects) {
      if (object.type === "ITEM") {
        counts.items += 1;
        persistItem(statements, object, runId, timestamp, counts);
      } else if (object.type === "IMAGE") {
        counts.images += 1;
        const image = object.imageData;
        statements.upsertImage.run(
          object.id,
          cleanText(image?.name),
          cleanText(image?.url),
          cleanText(image?.caption),
          stringifyBigInt(object.version),
          cleanText(object.updatedAt),
          runId,
          timestamp
        );
      } else if (object.type === "CATEGORY") {
        counts.categories += 1;
        const category = object.categoryData;
        statements.upsertCategory.run(
          object.id,
          cleanText(category?.name) || "Unnamed category",
          cleanText(category?.parentCategory?.id),
          cleanText(category?.rootCategory),
          boolInt(category?.isTopLevel),
          nullableBoolInt(category?.onlineVisibility),
          stringifyBigInt(object.version),
          cleanText(object.updatedAt),
          runId,
          timestamp
        );
      }
    }
    database.exec("COMMIT");
    return counts;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function persistItem(statements, item, runId, timestamp, counts) {
  const data = item.itemData;
  const categoryIds = uniqueStrings([
    ...(data?.categories ?? []).map((category) => category.id),
    data?.categoryId
  ]);
  const imageIds = uniqueStrings([...(data?.imageIds ?? []), item.imageId]);
  const variations = (data?.variations ?? []).filter((variation) => variation.type === "ITEM_VARIATION");

  statements.upsertItem.run(
    item.id,
    cleanText(data?.name) || "Unnamed item",
    cleanText(data?.buyerFacingName),
    cleanText(data?.descriptionPlaintext) || cleanText(data?.description),
    cleanText(data?.descriptionHtml),
    cleanText(data?.productType),
    cleanText(data?.reportingCategory?.id),
    boolInt(data?.isArchived),
    item.presentAtAllLocations === false ? 0 : 1,
    json(item.presentAtLocationIds ?? []),
    json(item.absentAtLocationIds ?? []),
    json(data?.channels ?? []),
    stringifyBigInt(item.version),
    cleanText(item.updatedAt),
    runId,
    timestamp
  );

  statements.deleteItemCategories.run(item.id);
  categoryIds.forEach((categoryId, index) => statements.insertItemCategory.run(item.id, categoryId, index));
  statements.deleteItemImages.run(item.id);
  imageIds.forEach((imageId, index) => statements.insertItemImage.run(item.id, imageId, index));

  for (const variation of variations) {
    counts.variations += 1;
    const variationData = variation.itemVariationData;
    const variationImageIds = uniqueStrings([...(variationData?.imageIds ?? []), variation.imageId]);
    const soldOutLocationIds = uniqueStrings((variationData?.locationOverrides ?? [])
      .filter((override) => override.soldOut === true)
      .map((override) => override.locationId));

    statements.upsertVariation.run(
      variation.id,
      item.id,
      cleanText(variationData?.name) || "Default",
      cleanText(variationData?.sku),
      cleanText(variationData?.upc),
      stringifyBigInt(variationData?.priceMoney?.amount),
      cleanText(variationData?.priceMoney?.currency),
      cleanText(variationData?.pricingType),
      boolInt(variationData?.trackInventory),
      variationData?.sellable === false ? 0 : 1,
      boolInt(variationData?.stockable),
      variation.presentAtAllLocations === false ? 0 : 1,
      json(variation.presentAtLocationIds ?? []),
      json(variation.absentAtLocationIds ?? []),
      json(soldOutLocationIds),
      stringifyBigInt(variation.version),
      cleanText(variation.updatedAt),
      runId,
      timestamp
    );

    statements.deleteVariationImages.run(variation.id);
    variationImageIds.forEach((imageId, index) => statements.insertVariationImage.run(variation.id, imageId, index));
  }
}

function prepareCatalogStatements(database) {
  return {
    upsertItem: database.prepare(`
      INSERT INTO catalog_items (
        id, name, buyer_facing_name, description_plaintext, description_html, product_type,
        reporting_category_id, is_archived, present_at_all_locations, present_at_location_ids,
        absent_at_location_ids, channels, square_version, square_updated_at, last_seen_run_id, cached_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, buyer_facing_name=excluded.buyer_facing_name,
        description_plaintext=excluded.description_plaintext, description_html=excluded.description_html,
        product_type=excluded.product_type, reporting_category_id=excluded.reporting_category_id,
        is_archived=excluded.is_archived, present_at_all_locations=excluded.present_at_all_locations,
        present_at_location_ids=excluded.present_at_location_ids, absent_at_location_ids=excluded.absent_at_location_ids,
        channels=excluded.channels, square_version=excluded.square_version, square_updated_at=excluded.square_updated_at,
        last_seen_run_id=excluded.last_seen_run_id, cached_at=excluded.cached_at, deleted_at=NULL
    `),
    upsertVariation: database.prepare(`
      INSERT INTO catalog_variations (
        id, item_id, name, sku, upc, price_amount, currency, pricing_type, track_inventory,
        sellable, stockable, present_at_all_locations, present_at_location_ids, absent_at_location_ids,
        sold_out_location_ids, square_version, square_updated_at, last_seen_run_id, cached_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        item_id=excluded.item_id, name=excluded.name, sku=excluded.sku, upc=excluded.upc,
        price_amount=excluded.price_amount, currency=excluded.currency, pricing_type=excluded.pricing_type,
        track_inventory=excluded.track_inventory, sellable=excluded.sellable, stockable=excluded.stockable,
        present_at_all_locations=excluded.present_at_all_locations, present_at_location_ids=excluded.present_at_location_ids,
        absent_at_location_ids=excluded.absent_at_location_ids, sold_out_location_ids=excluded.sold_out_location_ids,
        square_version=excluded.square_version, square_updated_at=excluded.square_updated_at,
        last_seen_run_id=excluded.last_seen_run_id, cached_at=excluded.cached_at, deleted_at=NULL
    `),
    upsertImage: database.prepare(`
      INSERT INTO catalog_images (id, name, url, caption, square_version, square_updated_at, last_seen_run_id, cached_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, caption=excluded.caption,
        square_version=excluded.square_version, square_updated_at=excluded.square_updated_at,
        last_seen_run_id=excluded.last_seen_run_id, cached_at=excluded.cached_at, deleted_at=NULL
    `),
    upsertCategory: database.prepare(`
      INSERT INTO catalog_categories (id, name, parent_category_id, root_category_id, is_top_level, online_visibility, square_version, square_updated_at, last_seen_run_id, cached_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, parent_category_id=excluded.parent_category_id,
        root_category_id=excluded.root_category_id, is_top_level=excluded.is_top_level,
        online_visibility=excluded.online_visibility, square_version=excluded.square_version,
        square_updated_at=excluded.square_updated_at, last_seen_run_id=excluded.last_seen_run_id,
        cached_at=excluded.cached_at, deleted_at=NULL
    `),
    deleteItemCategories: database.prepare("DELETE FROM catalog_item_categories WHERE item_id = ?"),
    insertItemCategory: database.prepare("INSERT OR REPLACE INTO catalog_item_categories (item_id, category_id, sort_order) VALUES (?, ?, ?)"),
    deleteItemImages: database.prepare("DELETE FROM catalog_item_images WHERE item_id = ?"),
    insertItemImage: database.prepare("INSERT OR REPLACE INTO catalog_item_images (item_id, image_id, sort_order) VALUES (?, ?, ?)"),
    deleteVariationImages: database.prepare("DELETE FROM catalog_variation_images WHERE variation_id = ?"),
    insertVariationImage: database.prepare("INSERT OR REPLACE INTO catalog_variation_images (variation_id, image_id, sort_order) VALUES (?, ?, ?)")
  };
}

function checkpointRun(database, runId, nextCursor, counts) {
  database.prepare(`
    UPDATE sync_runs SET
      next_cursor = ?, pages_completed = pages_completed + 1,
      objects_seen = objects_seen + ?, items_seen = items_seen + ?,
      variations_seen = variations_seen + ?, images_seen = images_seen + ?,
      categories_seen = categories_seen + ?, updated_at = ?
    WHERE id = ?
  `).run(nextCursor, counts.objects, counts.items, counts.variations, counts.images, counts.categories, now(), runId);
}

async function syncVendorsReadOnly(database, squareClient, runId) {
  let vendorCursor;
  let pages = 0;
  const statement = database.prepare(`
    INSERT INTO square_vendors (id, name, status, square_version, square_updated_at, last_seen_run_id, cached_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, status=excluded.status,
      square_version=excluded.square_version, square_updated_at=excluded.square_updated_at,
      last_seen_run_id=excluded.last_seen_run_id, cached_at=excluded.cached_at, deleted_at=NULL
  `);

  do {
    const response = await squareClient.vendors.search({
      filter: { status: ["ACTIVE", "INACTIVE"] },
      ...(vendorCursor ? { cursor: vendorCursor } : {})
    });
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const vendor of response.vendors ?? []) {
        if (!vendor.id || !vendor.name) continue;
        statement.run(
          vendor.id,
          vendor.name.trim(),
          vendor.status ?? "UNKNOWN",
          vendor.version ?? null,
          cleanText(vendor.updatedAt),
          runId,
          now()
        );
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    vendorCursor = response.cursor?.trim() || undefined;
    pages += 1;
  } while (vendorCursor && pages < 100);
}

function finalizeRun(database, runId) {
  const timestamp = now();
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const table of ["catalog_items", "catalog_variations", "catalog_images", "catalog_categories", "square_vendors"]) {
      database.prepare(`UPDATE ${table} SET deleted_at = ? WHERE last_seen_run_id <> ? AND deleted_at IS NULL`).run(timestamp, runId);
    }
    database.prepare(`
      UPDATE sync_runs SET status='completed', next_cursor=NULL, updated_at=?, finished_at=?, error_message=NULL WHERE id=?
    `).run(timestamp, timestamp, runId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function markRunPartial(database, runId) {
  database.prepare("UPDATE sync_runs SET status='partial', updated_at=? WHERE id=?").run(now(), runId);
}

function markRunFailed(database, runId, error) {
  const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown Square catalog sync error";
  database.prepare("UPDATE sync_runs SET status='failed', updated_at=?, error_message=? WHERE id=?").run(now(), message, runId);
}

function readRun(database, runId) {
  const row = database.prepare("SELECT * FROM sync_runs WHERE id = ?").get(runId);
  return {
    pagesCompleted: Number(row.pages_completed),
    itemsSeen: Number(row.items_seen),
    variationsSeen: Number(row.variations_seen),
    imagesSeen: Number(row.images_seen),
    categoriesSeen: Number(row.categories_seen)
  };
}

function readCatalogSummary(database) {
  const count = (table) => Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE deleted_at IS NULL`).get().count);
  const run = database.prepare("SELECT status, pages_completed, updated_at FROM sync_runs ORDER BY started_at DESC LIMIT 1").get();
  return {
    status: run?.status ?? "unavailable",
    pagesCompleted: Number(run?.pages_completed ?? 0),
    items: count("catalog_items"),
    variations: count("catalog_variations"),
    images: count("catalog_images"),
    categories: count("catalog_categories"),
    vendors: count("square_vendors"),
    updatedAt: run?.updated_at ?? null
  };
}

function parseArguments(values) {
  let maxPages = 2;
  let allPages = false;
  let restart = false;
  let confirmProductionReadOnly = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--all-pages") allPages = true;
    else if (value === "--restart") restart = true;
    else if (value === "--confirm-production-read-only") confirmProductionReadOnly = true;
    else if (value === "--max-pages") {
      const parsed = Number(values[index + 1]);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) fail("--max-pages must be an integer between 1 and 1000.");
      maxPages = parsed;
      index += 1;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }

  return { allPages, confirmProductionReadOnly, maxPages, restart };
}

function loadLocalEnvironment() {
  const path = resolve(process.cwd(), ".env.local");
  if (existsSync(path)) process.loadEnvFile(path);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())));
}

function stringifyBigInt(value) {
  return typeof value === "bigint" ? value.toString() : value === undefined || value === null ? null : String(value);
}

function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolInt(value) {
  return value === true ? 1 : 0;
}

function nullableBoolInt(value) {
  return typeof value === "boolean" ? boolInt(value) : null;
}

function json(value) {
  return JSON.stringify(value);
}

function now() {
  return new Date().toISOString();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
