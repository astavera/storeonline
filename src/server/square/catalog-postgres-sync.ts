import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { SquareClient, SquareEnvironment, type CatalogObject } from "square";
import { env } from "@/lib/validation/env";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

export type SquareCatalogChangePage = {
  objects: CatalogObject[];
  cursor?: string;
  latestTime?: string;
};

export interface SquareCatalogChangeSource {
  search(input: { beginTime?: string; cursor?: string }): Promise<SquareCatalogChangePage>;
}

export interface SquareCatalogSyncStore {
  acquire(environment: string, now: Date): Promise<{ lockToken: string; latestTime?: string }>;
  persistPage(objects: CatalogObject[], syncedAt: Date): Promise<void>;
  complete(environment: string, lockToken: string, latestTime: string | undefined, now: Date): Promise<void>;
  fail(environment: string, lockToken: string, error: unknown, now: Date): Promise<void>;
}

export class SquareCatalogSyncBusyError extends Error {
  constructor() {
    super("A Square catalog synchronization is already running.");
    this.name = "SquareCatalogSyncBusyError";
  }
}

export class SquareProductionSyncDisabledError extends Error {
  constructor() {
    super("Square production catalog synchronization is disabled until explicitly approved.");
    this.name = "SquareProductionSyncDisabledError";
  }
}

export async function synchronizeSquareCatalogChanges(input: {
  environment: string;
  source: SquareCatalogChangeSource;
  store: SquareCatalogSyncStore;
  now?: Date;
  onProgress?: (progress: { pages: number; objects: number; hasMore: boolean }) => void;
}) {
  const startedAt = input.now ?? new Date();
  const lease = await input.store.acquire(input.environment, startedAt);
  let cursor: string | undefined;
  let latestTime = lease.latestTime;
  let pages = 0;
  let objects = 0;

  try {
    do {
      const page = await input.source.search({ beginTime: lease.latestTime, cursor });
      await input.store.persistPage(page.objects, startedAt);
      pages += 1;
      objects += page.objects.length;
      cursor = page.cursor?.trim() || undefined;
      latestTime = page.latestTime ?? latestTime;
      input.onProgress?.({ pages, objects, hasMore: Boolean(cursor) });
      if (pages >= 1_000 && cursor) throw new Error("Square catalog synchronization exceeded 1000 pages.");
    } while (cursor);

    await input.store.complete(input.environment, lease.lockToken, latestTime, new Date());
    return { pages, objects, latestTime: latestTime ?? null };
  } catch (error) {
    await input.store.fail(input.environment, lease.lockToken, error, new Date());
    throw error;
  }
}

export async function syncConfiguredSquareCatalogChanges(options: {
  onProgress?: (progress: { pages: number; objects: number; hasMore: boolean }) => void;
} = {}) {
  requireReadOnlySquareSyncAllowed(
    env.SQUARE_ENVIRONMENT,
    env.SQUARE_ALLOW_PRODUCTION_READONLY_SYNC === "true"
  );
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("SQUARE_ACCESS_TOKEN is required for catalog synchronization.");
  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    timeoutInSeconds: 45,
    maxRetries: 4
  });
  const source: SquareCatalogChangeSource = {
    async search(input) {
      const response = await client.catalog.search({
        objectTypes: ["ITEM", "ITEM_VARIATION", "IMAGE", "CATEGORY"],
        includeDeletedObjects: true,
        includeRelatedObjects: true,
        limit: 1_000,
        ...(input.beginTime ? { beginTime: input.beginTime } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {})
      });
      return {
        objects: deduplicateCatalogObjects([...(response.objects ?? []), ...(response.relatedObjects ?? [])]),
        cursor: response.cursor,
        latestTime: response.latestTime
      };
    }
  };
  return synchronizeSquareCatalogChanges({
    environment: env.SQUARE_ENVIRONMENT,
    source,
    store: prismaSquareCatalogSyncStore,
    onProgress: options.onProgress
  });
}

export function requireReadOnlySquareSyncAllowed(
  environment: "sandbox" | "production",
  productionReadOnlyApproved = false
) {
  if (environment === "production" && !productionReadOnlyApproved) {
    throw new SquareProductionSyncDisabledError();
  }
}

const prismaSquareCatalogSyncStore: SquareCatalogSyncStore = {
  async acquire(environment, now) {
    const lockToken = randomUUID();
    const staleBefore = new Date(now.getTime() - 15 * 60_000);
    try {
      await getPrismaClient().squareCatalogSyncState.upsert({
        where: { environment },
        create: { environment },
        update: {}
      });
      const acquired = await getPrismaClient().squareCatalogSyncState.updateMany({
        where: {
          environment,
          OR: [{ lockedAt: null }, { lockedAt: { lte: staleBefore } }]
        },
        data: { lockedAt: now, lockToken, lastStartedAt: now, lastError: null }
      });
      if (acquired.count !== 1) throw new SquareCatalogSyncBusyError();
      const state = await getPrismaClient().squareCatalogSyncState.findUniqueOrThrow({ where: { environment } });
      return { lockToken, ...(state.latestTime ? { latestTime: state.latestTime } : {}) };
    } catch (error) {
      if (error instanceof SquareCatalogSyncBusyError) throw error;
      throw new PersistenceUnavailableError("Square catalog synchronization", { cause: error });
    }
  },

  async persistPage(objects, syncedAt) {
    try {
      await getPrismaClient().$transaction(async (transaction) => {
        await upsertCatalogObjects(transaction, objects.filter((candidate) => candidate.type !== "ITEM_VARIATION"), syncedAt);
        await upsertCatalogVariations(transaction, collectVariations(objects), syncedAt);
      }, { timeout: 60_000 });
    } catch (error) {
      throw new PersistenceUnavailableError("Square catalog synchronization", { cause: error });
    }
  },

  async complete(environment, lockToken, latestTime, now) {
    await releaseSyncState({ environment, lockToken, latestTime, now });
  },

  async fail(environment, lockToken, error, now) {
    await releaseSyncState({ environment, lockToken, error, now });
  }
};

async function releaseSyncState(input: {
  environment: string;
  lockToken: string;
  latestTime?: string;
  error?: unknown;
  now: Date;
}) {
  try {
    const update = await getPrismaClient().squareCatalogSyncState.updateMany({
      where: { environment: input.environment, lockToken: input.lockToken },
      data: {
        lockedAt: null,
        lockToken: null,
        ...(input.error
          ? { lastError: sanitizeSyncError(input.error) }
          : { latestTime: input.latestTime, lastCompletedAt: input.now, lastError: null })
      }
    });
    if (update.count !== 1) throw new Error("Square catalog synchronization lease was lost.");
  } catch (error) {
    throw new PersistenceUnavailableError("Square catalog synchronization", { cause: error });
  }
}

async function upsertCatalogObjects(transaction: Prisma.TransactionClient, objects: CatalogObject[], syncedAt: Date) {
  const records = objects.map((object) => {
    const itemData = object.type === "ITEM" ? object.itemData : undefined;
    return {
      id: requireCatalogObjectId(object),
      type: object.type,
      version: object.version ?? null,
      reportingCategoryId: itemData?.reportingCategory?.id ?? null,
      categoryIds: itemData ? uniqueStrings([...(itemData.categories ?? []).map((category) => category.id), itemData.categoryId]) : [],
      name: catalogObjectName(object),
      descriptionHtml: itemData?.descriptionHtml ?? null,
      descriptionPlaintext: itemData?.descriptionPlaintext ?? itemData?.description ?? null,
      raw: JSON.stringify(compactSquareCatalogObject(object)),
      deletedAt: object.isDeleted ? syncedAt : null
    };
  });
  for (let index = 0; index < records.length; index += 250) {
    const values = records.slice(index, index + 250).map((record) => Prisma.sql`(
      ${record.id}, ${record.type}, ${record.version}, ${record.reportingCategoryId},
      ${record.categoryIds}::text[], ${record.name}, ${record.descriptionHtml},
      ${record.descriptionPlaintext}, ${record.raw}::jsonb, ${syncedAt}, ${record.deletedAt}
    )`);
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "SquareCatalogObject"
        ("id", "type", "version", "reportingCategoryId", "categoryIds", "name", "descriptionHtml", "descriptionPlaintext", "raw", "syncedAt", "deletedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("id") DO UPDATE SET
        "type" = EXCLUDED."type",
        "version" = EXCLUDED."version",
        "reportingCategoryId" = EXCLUDED."reportingCategoryId",
        "categoryIds" = EXCLUDED."categoryIds",
        "name" = EXCLUDED."name",
        "descriptionHtml" = EXCLUDED."descriptionHtml",
        "descriptionPlaintext" = EXCLUDED."descriptionPlaintext",
        "raw" = EXCLUDED."raw",
        "syncedAt" = EXCLUDED."syncedAt",
        "deletedAt" = CASE
          WHEN EXCLUDED."deletedAt" IS NULL THEN NULL
          ELSE COALESCE("SquareCatalogObject"."deletedAt", EXCLUDED."deletedAt")
        END
      WHERE "SquareCatalogObject"."type" IS DISTINCT FROM EXCLUDED."type"
        OR "SquareCatalogObject"."version" IS DISTINCT FROM EXCLUDED."version"
        OR "SquareCatalogObject"."reportingCategoryId" IS DISTINCT FROM EXCLUDED."reportingCategoryId"
        OR "SquareCatalogObject"."categoryIds" IS DISTINCT FROM EXCLUDED."categoryIds"
        OR "SquareCatalogObject"."name" IS DISTINCT FROM EXCLUDED."name"
        OR "SquareCatalogObject"."descriptionHtml" IS DISTINCT FROM EXCLUDED."descriptionHtml"
        OR "SquareCatalogObject"."descriptionPlaintext" IS DISTINCT FROM EXCLUDED."descriptionPlaintext"
        OR "SquareCatalogObject"."raw" IS DISTINCT FROM EXCLUDED."raw"
        OR ("SquareCatalogObject"."deletedAt" IS NULL) IS DISTINCT FROM (EXCLUDED."deletedAt" IS NULL)
    `);
  }
  const deletedItemIds = objects
    .filter((object) => object.type === "ITEM" && object.isDeleted)
    .map((object) => requireCatalogObjectId(object));
  if (deletedItemIds.length > 0) {
    await transaction.squareItemVariation.updateMany({
      where: { itemId: { in: deletedItemIds }, deletedAt: null },
      data: { deletedAt: syncedAt, syncedAt }
    });
  }
}

async function upsertCatalogVariations(
  transaction: Prisma.TransactionClient,
  variations: Array<{ object: Extract<CatalogObject, { type: "ITEM_VARIATION" }>; parentItemId?: string }>,
  syncedAt: Date
) {
  const tombstoneIds: string[] = [];
  const records = variations.flatMap(({ object, parentItemId }) => {
    const variationData = object.itemVariationData;
    const itemId = variationData?.itemId ?? parentItemId;
    if (!itemId) {
      if (object.isDeleted) {
        tombstoneIds.push(object.id);
        return [];
      }
      throw new Error(`Square variation ${object.id} is missing its parent item.`);
    }
    return [{
      id: object.id,
      itemId,
      name: variationData?.name?.trim() || "Default",
      sku: variationData?.sku?.trim() || null,
      upc: variationData?.upc?.trim() || null,
      priceMoney: variationData?.priceMoney ? JSON.stringify(toPrismaJson(variationData.priceMoney)) : null,
      raw: JSON.stringify(compactSquareCatalogObject(object)),
      deletedAt: object.isDeleted ? syncedAt : null
    }];
  });
  for (let index = 0; index < records.length; index += 250) {
    const values = records.slice(index, index + 250).map((record) => Prisma.sql`(
      ${record.id}, ${record.itemId}, ${record.name}, ${record.sku}, ${record.upc},
      ${record.priceMoney}::jsonb, ${record.raw}::jsonb, ${syncedAt}, ${record.deletedAt}
    )`);
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "SquareItemVariation"
        ("id", "itemId", "name", "sku", "upc", "priceMoney", "raw", "syncedAt", "deletedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("id") DO UPDATE SET
        "itemId" = EXCLUDED."itemId",
        "name" = EXCLUDED."name",
        "sku" = EXCLUDED."sku",
        "upc" = EXCLUDED."upc",
        "priceMoney" = EXCLUDED."priceMoney",
        "raw" = EXCLUDED."raw",
        "syncedAt" = EXCLUDED."syncedAt",
        "deletedAt" = CASE
          WHEN EXCLUDED."deletedAt" IS NULL THEN NULL
          ELSE COALESCE("SquareItemVariation"."deletedAt", EXCLUDED."deletedAt")
        END
      WHERE "SquareItemVariation"."itemId" IS DISTINCT FROM EXCLUDED."itemId"
        OR "SquareItemVariation"."name" IS DISTINCT FROM EXCLUDED."name"
        OR "SquareItemVariation"."sku" IS DISTINCT FROM EXCLUDED."sku"
        OR "SquareItemVariation"."upc" IS DISTINCT FROM EXCLUDED."upc"
        OR "SquareItemVariation"."priceMoney" IS DISTINCT FROM EXCLUDED."priceMoney"
        OR "SquareItemVariation"."raw" IS DISTINCT FROM EXCLUDED."raw"
        OR ("SquareItemVariation"."deletedAt" IS NULL) IS DISTINCT FROM (EXCLUDED."deletedAt" IS NULL)
    `);
  }
  if (tombstoneIds.length > 0) {
    await transaction.squareItemVariation.updateMany({
      where: { id: { in: tombstoneIds }, deletedAt: null },
      data: { syncedAt, deletedAt: syncedAt }
    });
  }
}

export function compactSquareCatalogObject(object: CatalogObject): Prisma.InputJsonValue {
  if (object.isDeleted) return {};

  if (object.type === "ITEM") {
    return toPrismaJson({
      imageId: object.imageId,
      itemData: {
        imageIds: object.itemData?.imageIds
      }
    });
  }

  if (object.type === "ITEM_VARIATION") {
    return toPrismaJson({
      imageId: object.imageId,
      itemVariationData: {
        imageIds: object.itemVariationData?.imageIds,
        trackInventory: object.itemVariationData?.trackInventory
      }
    });
  }

  if (object.type === "IMAGE") {
    return toPrismaJson({
      imageData: {
        url: object.imageData?.url
      }
    });
  }

  if (object.type === "CATEGORY") {
    return toPrismaJson({
      categoryData: {
        name: object.categoryData?.name
      }
    });
  }

  return {};
}

function collectVariations(objects: CatalogObject[]) {
  const variations = new Map<string, { object: Extract<CatalogObject, { type: "ITEM_VARIATION" }>; parentItemId?: string }>();
  for (const object of objects) {
    if (object.type === "ITEM_VARIATION") variations.set(object.id, { object });
    if (object.type !== "ITEM") continue;
    for (const nested of object.itemData?.variations ?? []) {
      if (nested.type === "ITEM_VARIATION") variations.set(nested.id, { object: nested, parentItemId: object.id });
    }
  }
  return Array.from(variations.values());
}

function catalogObjectName(object: CatalogObject) {
  if (object.type === "ITEM") return object.itemData?.name?.trim() || null;
  if (object.type === "IMAGE") return object.imageData?.name?.trim() || null;
  if (object.type === "CATEGORY") return object.categoryData?.name?.trim() || null;
  return null;
}

function deduplicateCatalogObjects(objects: CatalogObject[]) {
  return Array.from(new Map(objects.map((object) => [requireCatalogObjectId(object), object])).values());
}

function requireCatalogObjectId(object: CatalogObject) {
  const id = object.id?.trim();
  if (!id) throw new Error(`Square ${object.type} object is missing its id.`);
  return id;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())));
}

function sanitizeSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : "Square catalog synchronization failed.";
  return message.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s@]+@/gi, "[redacted-url]").slice(0, 500);
}
