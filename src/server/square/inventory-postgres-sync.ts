import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { SquareClient, SquareEnvironment, type InventoryCount } from "square";
import { env } from "@/lib/validation/env";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import {
  requireReadOnlySquareSyncAllowed,
  SquareCatalogSyncBusyError
} from "@/server/square/catalog-postgres-sync";

export type SquareInventorySnapshot = {
  variationId: string;
  squareLocationId: string;
  state: string;
  quantity: string;
  calculatedAt: Date;
};

export type SquareInventoryPage = {
  counts: InventoryCount[];
  cursor?: string;
};

export interface SquareInventorySource {
  search(input: { updatedAfter?: string; cursor?: string }): Promise<SquareInventoryPage>;
}

export interface SquareInventorySyncStore {
  acquire(key: string, now: Date): Promise<{ lockToken: string; latestTime?: string }>;
  persistPage(snapshots: SquareInventorySnapshot[], syncedAt: Date): Promise<{ persisted: number; skipped: number }>;
  complete(key: string, lockToken: string, latestTime: string, now: Date): Promise<void>;
  fail(key: string, lockToken: string, error: unknown, now: Date): Promise<void>;
}

export async function synchronizeSquareInventoryCounts(input: {
  environment: string;
  source: SquareInventorySource;
  store: SquareInventorySyncStore;
  now?: Date;
  onProgress?: (progress: { pages: number; received: number; persisted: number; skipped: number; hasMore: boolean }) => void;
}) {
  const startedAt = input.now ?? new Date();
  const key = `${input.environment}:inventory`;
  const lease = await input.store.acquire(key, startedAt);
  let cursor: string | undefined;
  let pages = 0;
  let received = 0;
  let persisted = 0;
  let skipped = 0;

  try {
    do {
      const page = await input.source.search({ updatedAfter: lease.latestTime, cursor });
      const snapshots = page.counts.flatMap((count) => {
        const normalized = normalizeSquareInventoryCount(count);
        return normalized ? [normalized] : [];
      });
      const result = await input.store.persistPage(snapshots, startedAt);
      pages += 1;
      received += page.counts.length;
      persisted += result.persisted;
      skipped += page.counts.length - snapshots.length + result.skipped;
      cursor = page.cursor?.trim() || undefined;
      input.onProgress?.({ pages, received, persisted, skipped, hasMore: Boolean(cursor) });
      if (pages >= 10_000 && cursor) throw new Error("Square inventory synchronization exceeded 10000 pages.");
    } while (cursor);

    const latestTime = startedAt.toISOString();
    await input.store.complete(key, lease.lockToken, latestTime, new Date());
    return { pages, received, persisted, skipped, latestTime };
  } catch (error) {
    await input.store.fail(key, lease.lockToken, error, new Date());
    throw error;
  }
}

export async function syncConfiguredSquareInventoryCounts(options: {
  onProgress?: (progress: { pages: number; received: number; persisted: number; skipped: number; hasMore: boolean }) => void;
} = {}) {
  requireReadOnlySquareSyncAllowed(
    env.SQUARE_ENVIRONMENT,
    env.SQUARE_ALLOW_PRODUCTION_READONLY_SYNC === "true"
  );
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("SQUARE_ACCESS_TOKEN is required for inventory synchronization.");
  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    timeoutInSeconds: 45,
    maxRetries: 4
  });
  const source: SquareInventorySource = {
    async search(input) {
      const page = await client.inventory.batchGetCounts({
        states: ["IN_STOCK"],
        limit: 1_000,
        ...(input.updatedAfter ? { updatedAfter: input.updatedAfter } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {})
      });
      return {
        counts: page.data,
        cursor: page.response.cursor
      };
    }
  };
  return synchronizeSquareInventoryCounts({
    environment: env.SQUARE_ENVIRONMENT,
    source,
    store: prismaSquareInventorySyncStore,
    onProgress: options.onProgress
  });
}

export function normalizeSquareInventoryCount(count: InventoryCount): SquareInventorySnapshot | null {
  if (count.catalogObjectType !== "ITEM_VARIATION") return null;
  const variationId = count.catalogObjectId?.trim();
  const squareLocationId = count.locationId?.trim();
  const state = count.state?.trim();
  const quantity = count.quantity?.trim();
  const calculatedAt = count.calculatedAt ? new Date(count.calculatedAt) : null;
  if (!variationId || !squareLocationId || !state || !quantity || !calculatedAt || Number.isNaN(calculatedAt.getTime())) return null;
  try {
    new Prisma.Decimal(quantity);
  } catch {
    return null;
  }
  return { variationId, squareLocationId, state, quantity, calculatedAt };
}

export async function persistSquareInventorySnapshots(
  snapshots: SquareInventorySnapshot[],
  options: { syncedAt?: Date; skipUnknownVariations?: boolean } = {}
) {
  const syncedAt = options.syncedAt ?? new Date();
  const deduplicated = deduplicateSnapshots(snapshots);
  try {
    const known = await getPrismaClient().squareItemVariation.findMany({
      where: { id: { in: deduplicated.map((snapshot) => snapshot.variationId) }, deletedAt: null },
      select: { id: true }
    });
    const knownIds = new Set(known.map((variation) => variation.id));
    const unknown = deduplicated.filter((snapshot) => !knownIds.has(snapshot.variationId));
    if (unknown.length > 0 && !options.skipUnknownVariations) {
      throw new Error(`Square inventory references ${unknown.length} unknown catalog variation(s).`);
    }
    const rows = deduplicated.filter((snapshot) => knownIds.has(snapshot.variationId));
    for (let index = 0; index < rows.length; index += 500) {
      const chunk = rows.slice(index, index + 500);
      const values = chunk.map((snapshot) => Prisma.sql`(
        ${randomUUID()},
        ${snapshot.variationId},
        ${snapshot.squareLocationId},
        ${new Prisma.Decimal(snapshot.quantity)},
        ${snapshot.state},
        ${snapshot.calculatedAt},
        ${syncedAt}
      )`);
      await getPrismaClient().$executeRaw(Prisma.sql`
        INSERT INTO "SquareInventoryCount"
          ("id", "variationId", "squareLocationId", "quantity", "state", "calculatedAt", "syncedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("variationId", "squareLocationId", "state") DO UPDATE SET
          "quantity" = EXCLUDED."quantity",
          "calculatedAt" = EXCLUDED."calculatedAt",
          "syncedAt" = EXCLUDED."syncedAt"
        WHERE "SquareInventoryCount"."calculatedAt" <= EXCLUDED."calculatedAt"
      `);
    }
    return { persisted: rows.length, skipped: unknown.length };
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("Square inventory projection", { cause: error });
  }
}

const prismaSquareInventorySyncStore: SquareInventorySyncStore = {
  async acquire(key, now) {
    const lockToken = randomUUID();
    const staleBefore = new Date(now.getTime() - 15 * 60_000);
    try {
      await getPrismaClient().squareCatalogSyncState.upsert({ where: { environment: key }, create: { environment: key }, update: {} });
      const acquired = await getPrismaClient().squareCatalogSyncState.updateMany({
        where: { environment: key, OR: [{ lockedAt: null }, { lockedAt: { lte: staleBefore } }] },
        data: { lockedAt: now, lockToken, lastStartedAt: now, lastError: null }
      });
      if (acquired.count !== 1) throw new SquareCatalogSyncBusyError();
      const state = await getPrismaClient().squareCatalogSyncState.findUniqueOrThrow({ where: { environment: key } });
      return { lockToken, ...(state.latestTime ? { latestTime: state.latestTime } : {}) };
    } catch (error) {
      if (error instanceof SquareCatalogSyncBusyError) throw error;
      throw new PersistenceUnavailableError("Square inventory synchronization", { cause: error });
    }
  },

  async persistPage(snapshots, syncedAt) {
    return persistSquareInventorySnapshots(snapshots, { syncedAt, skipUnknownVariations: true });
  },

  async complete(key, lockToken, latestTime, now) {
    await releaseInventorySyncState({ key, lockToken, latestTime, now });
  },

  async fail(key, lockToken, error, now) {
    await releaseInventorySyncState({ key, lockToken, error, now });
  }
};

async function releaseInventorySyncState(input: { key: string; lockToken: string; latestTime?: string; error?: unknown; now: Date }) {
  try {
    const result = await getPrismaClient().squareCatalogSyncState.updateMany({
      where: { environment: input.key, lockToken: input.lockToken },
      data: {
        lockedAt: null,
        lockToken: null,
        ...(input.error
          ? { lastError: sanitizeInventorySyncError(input.error) }
          : { latestTime: input.latestTime, lastCompletedAt: input.now, lastError: null })
      }
    });
    if (result.count !== 1) throw new Error("Square inventory synchronization lease was lost.");
  } catch (error) {
    throw new PersistenceUnavailableError("Square inventory synchronization", { cause: error });
  }
}

function deduplicateSnapshots(snapshots: SquareInventorySnapshot[]) {
  const byKey = new Map<string, SquareInventorySnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.variationId}\0${snapshot.squareLocationId}\0${snapshot.state}`;
    const current = byKey.get(key);
    if (!current || current.calculatedAt <= snapshot.calculatedAt) byKey.set(key, snapshot);
  }
  return Array.from(byKey.values());
}

function sanitizeInventorySyncError(error: unknown) {
  const message = error instanceof Error ? error.message : "Square inventory synchronization failed.";
  return message.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s@]+@/gi, "[redacted-url]").slice(0, 500);
}
