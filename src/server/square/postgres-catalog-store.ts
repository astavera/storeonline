/**
 * Implements server-side postgres catalog store behavior and persistence boundaries.
 */

import "server-only";

import type { Prisma, SquareCatalogSyncState } from "@prisma/client";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { env } from "@/lib/validation/env";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

export type PostgresCatalogSummary = {
  available: boolean;
  environment: string | null;
  itemCount: number;
  variationCount: number;
  updatedAt: string | null;
};

export type PostgresInventorySyncSummary = {
  available: boolean;
  lastCompletedAt: string | null;
  latestTime: string | null;
  totalOperationalLocations: number;
  mappedOperationalLocations: number;
};

export type OperationalStoreLocation = {
  id: string;
  name: string;
  address: string;
  squareLocationId: string;
  pickupEnabled: boolean;
  localDeliveryEnabled: boolean;
  shippingFulfillmentEnabled: boolean;
};

export type PublishedStorefrontShippingPolicy = {
  squareVariationId: string;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
  packageWeightLb: string;
};

type CatalogSyncEvidence = Pick<
  SquareCatalogSyncState,
  | "environment"
  | "latestTime"
  | "lastStartedAt"
  | "lastCompletedAt"
  | "lastError"
  | "lockedAt"
  | "lockToken"
>;

const catalogSyncEnvironments = ["sandbox", "production"] as const;
const inventorySyncEnvironments = ["sandbox:inventory", "production:inventory"] as const;

export async function readPostgresCatalogSummary(): Promise<PostgresCatalogSummary> {
  try {
    const prisma = getPrismaClient();
    const [states, itemCount, variationCount] = await Promise.all([
      readCatalogSyncEvidence(prisma),
      prisma.squareCatalogObject.count({ where: { type: "ITEM", deletedAt: null } }),
      prisma.squareItemVariation.count({ where: { deletedAt: null, item: { deletedAt: null } } })
    ]);
    const state = exactCompletedCatalogSync(states, env.SQUARE_ENVIRONMENT);
    return {
      available: Boolean(state && itemCount > 0 && variationCount > 0),
      environment: state?.environment ?? null,
      itemCount,
      variationCount,
      updatedAt: state?.lastCompletedAt?.toISOString() ?? null
    };
  } catch (error) {
    throw new PersistenceUnavailableError("PostgreSQL Square catalog", { cause: error });
  }
}

export async function readPostgresInventorySyncSummary(): Promise<PostgresInventorySyncSummary> {
  try {
    const prisma = getPrismaClient();
    const [states, locations] = await Promise.all([
      readInventorySyncEvidence(prisma),
      prisma.storeLocation.findMany({
        where: {
          OR: [{ pickupEnabled: true }, { localDeliveryEnabled: true }, { shippingFulfillmentEnabled: true }]
        },
        select: { squareLocationId: true }
      })
    ]);
    const state = exactCompletedInventorySync(states, env.SQUARE_ENVIRONMENT);
    return {
      available: Boolean(state),
      lastCompletedAt: state?.lastCompletedAt?.toISOString() ?? null,
      latestTime: state?.latestTime ?? null,
      totalOperationalLocations: locations.length,
      mappedOperationalLocations: locations.filter((location) => Boolean(location.squareLocationId)).length
    };
  } catch (error) {
    throw new PersistenceUnavailableError("PostgreSQL Square inventory", { cause: error });
  }
}

export async function readMappedOperationalStoreLocations(): Promise<OperationalStoreLocation[]> {
  if (process.env.E2E_CATALOG_FIXTURE === "true") {
    return [
      {
        id: "store-3rd-avenue",
        name: "3rd Avenue Store",
        address: "1243 3rd Ave., New York, NY 10021",
        squareLocationId: "e2e-square-3rd-avenue",
        pickupEnabled: true,
        localDeliveryEnabled: true,
        shippingFulfillmentEnabled: false
      },
      {
        id: "store-86th-street",
        name: "86th Street Store",
        address: "112 East 86th Street, New York, NY 10028",
        squareLocationId: "e2e-square-86th-street",
        pickupEnabled: true,
        localDeliveryEnabled: true,
        shippingFulfillmentEnabled: false
      }
    ];
  }
  try {
    const locations = await getPrismaClient().storeLocation.findMany({
      where: {
        squareLocationId: { not: null },
        OR: [{ pickupEnabled: true }, { localDeliveryEnabled: true }, { shippingFulfillmentEnabled: true }]
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        squareLocationId: true,
        pickupEnabled: true,
        localDeliveryEnabled: true,
        shippingFulfillmentEnabled: true
      }
    });
    return locations.flatMap((location) => location.squareLocationId ? [{ ...location, squareLocationId: location.squareLocationId }] : []);
  } catch (error) {
    throw new PersistenceUnavailableError("PostgreSQL operational locations", { cause: error });
  }
}

export async function readPostgresStorefrontProductsByVariationIds(
  variationIds: string[],
  options: { squareLocationIds?: string[] } = {}
): Promise<StorefrontProduct[]> {
  const normalizedIds = Array.from(new Set(variationIds.map((id) => id.trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return [];

  try {
    const prisma = getPrismaClient();
    const [catalogState, inventoryState] = await Promise.all([
      readCatalogSyncEvidence(prisma).then((states) => exactCompletedCatalogSync(states, env.SQUARE_ENVIRONMENT)),
      readInventorySyncEvidence(prisma).then((states) => exactCompletedInventorySync(states, env.SQUARE_ENVIRONMENT))
    ]);
    if (!catalogState || !inventoryState) return [];

    const mappedLocations = await readMappedOperationalStoreLocations();
    const squareLocationIds = options.squareLocationIds ?? mappedLocations.map((location) => location.squareLocationId);
    const requestedLocationIds = new Set(squareLocationIds);
    const pickupLocations = mappedLocations.filter((location) => location.pickupEnabled && requestedLocationIds.has(location.squareLocationId));
    const variations = await prisma.squareItemVariation.findMany({
      where: { id: { in: normalizedIds }, deletedAt: null, item: { deletedAt: null } },
      include: {
        item: true,
        inventoryCounts: { where: { squareLocationId: { in: squareLocationIds }, state: "IN_STOCK" } }
      }
    });
    const imageIds = uniqueStrings(variations.flatMap((variation) => [
      ...jsonStringArray(jsonObject(variation.raw)?.itemVariationData, "imageIds"),
      jsonString(variation.raw, "imageId"),
      ...jsonStringArray(variation.item.raw, "imageIds"),
      jsonString(variation.item.raw, "imageId"),
      ...jsonStringArray(jsonObject(variation.item.raw)?.itemData, "imageIds")
    ]));
    const categoryIds = uniqueStrings(variations.flatMap((variation) => variation.item.categoryIds));
    const related = await prisma.squareCatalogObject.findMany({
      where: { id: { in: [...imageIds, ...categoryIds] }, deletedAt: null }
    });
    const relatedById = new Map(related.map((object) => [object.id, object]));
    const byId = new Map(variations.map((variation) => {
      const itemName = variation.item.name?.trim() || "Unnamed item";
      const variationName = variation.name?.trim() || "Default";
      const displayName = /^(default|regular)$/i.test(variationName) ? itemName : `${itemName} - ${variationName}`;
      const description = variation.item.descriptionPlaintext?.trim() || "Available from the read-only Square catalog.";
      const priceCents = moneyAmount(variation.priceMoney);
      const trackInventory = jsonBoolean(jsonObject(variation.raw)?.itemVariationData, "trackInventory");
      const inventoryQuantity = variation.inventoryCounts
        .filter((count) => count.state === "IN_STOCK")
        .reduce((sum, count) => sum + count.quantity.toNumber(), 0);
      const pickupInventory = trackInventory
        ? pickupLocations.flatMap((location) => {
            const locationCounts = variation.inventoryCounts.filter((count) => count.squareLocationId === location.squareLocationId && count.state === "IN_STOCK");
            if (locationCounts.length === 0) return [];

            return [{
              locationId: location.id,
              locationName: location.name,
              quantity: Math.max(0, Math.trunc(locationCounts.reduce((sum, count) => sum + count.quantity.toNumber(), 0)))
            }];
          })
        : [];
      const imageUrl = imageIdsForVariation(variation.raw, variation.item.raw)
        .map((id) => imageUrlFromRaw(relatedById.get(id)?.raw))
        .find(Boolean) ?? "/images/product-fallback.svg";
      const department = variation.item.categoryIds
        .map((id) => categoryNameFromRaw(relatedById.get(id)?.raw))
        .find(Boolean) ?? "Square catalog";

      const product: StorefrontProduct = {
        id: variation.itemId,
        squareVariationId: variation.id,
        ...(variation.sku?.trim() ? { sku: variation.sku.trim() } : {}),
        ...(variation.upc?.trim() ? { upc: variation.upc.trim() } : {}),
        slug: squareStorefrontSlug(itemName, variation.id),
        name: displayName,
        department,
        shortDescription: description.slice(0, 180),
        description,
        imageUrl,
        imageAlt: displayName,
        priceCents: priceCents ?? 0,
        priceAvailable: priceCents !== null,
        fulfillmentModes: [],
        inventoryTracked: trackInventory,
        availableQuantity: trackInventory ? inventoryQuantity : null,
        ...(pickupInventory.length > 0 ? { pickupInventory } : {}),
        inventoryStatus: trackInventory
          ? inventoryQuantity <= 0
            ? "out-of-stock"
            : inventoryQuantity <= 5
              ? "limited"
              : "in-stock"
          : "in-stock"
      };
      return [variation.id, product] as const;
    }));
    return normalizedIds.map((id) => byId.get(id)).filter((product): product is StorefrontProduct => Boolean(product));
  } catch (error) {
    throw new PersistenceUnavailableError("PostgreSQL Square catalog", { cause: error });
  }
}

export async function readPublishedStorefrontShippingPoliciesByVariationIds(
  variationIds: string[],
  now = new Date()
): Promise<PublishedStorefrontShippingPolicy[]> {
  const normalizedIds = Array.from(new Set(variationIds.map((id) => id.trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return [];

  try {
    const policies = await getPrismaClient().productOverride.findMany({
      where: {
        squareVariationId: { in: normalizedIds },
        webVisible: true,
        webStatus: "PUBLISHED",
        publishedAt: { lte: now },
        unpublishedAt: null,
        shippingAllowed: true,
        isShippable: true,
        fulfillmentModes: { has: "SHIPPING" }
      },
      select: {
        squareVariationId: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        packageWeightLb: true
      }
    });

    return policies.flatMap((policy) => {
      if (
        policy.packageLengthIn === null ||
        policy.packageWidthIn === null ||
        policy.packageHeightIn === null ||
        policy.packageWeightLb === null
      ) return [];
      return [{
        squareVariationId: policy.squareVariationId,
        packageLengthIn: policy.packageLengthIn.toString(),
        packageWidthIn: policy.packageWidthIn.toString(),
        packageHeightIn: policy.packageHeightIn.toString(),
        packageWeightLb: policy.packageWeightLb.toString()
      }];
    });
  } catch (error) {
    throw new PersistenceUnavailableError("PostgreSQL shipping catalog policy", { cause: error });
  }
}

async function readCatalogSyncEvidence(prisma = getPrismaClient()): Promise<CatalogSyncEvidence[]> {
  return prisma.squareCatalogSyncState.findMany({
    where: { environment: { in: [...catalogSyncEnvironments] } },
    select: {
      environment: true,
      latestTime: true,
      lastStartedAt: true,
      lastCompletedAt: true,
      lastError: true,
      lockedAt: true,
      lockToken: true
    }
  });
}

function exactCompletedCatalogSync(
  states: CatalogSyncEvidence[],
  expectedEnvironment: "sandbox" | "production"
): CatalogSyncEvidence | null {
  return exactCompletedSync(
    states,
    expectedEnvironment,
    env.SQUARE_CATALOG_SYNC_MAX_AGE_SECONDS,
    false
  );
}

async function readInventorySyncEvidence(prisma = getPrismaClient()): Promise<CatalogSyncEvidence[]> {
  return prisma.squareCatalogSyncState.findMany({
    where: { environment: { in: [...inventorySyncEnvironments] } },
    select: {
      environment: true,
      latestTime: true,
      lastStartedAt: true,
      lastCompletedAt: true,
      lastError: true,
      lockedAt: true,
      lockToken: true
    }
  });
}

function exactCompletedInventorySync(
  states: CatalogSyncEvidence[],
  expectedEnvironment: "sandbox" | "production"
): CatalogSyncEvidence | null {
  return exactCompletedSync(
    states,
    `${expectedEnvironment}:inventory`,
    env.SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS,
    true
  );
}

function exactCompletedSync(
  states: CatalogSyncEvidence[],
  expectedEnvironment: string,
  maximumAgeSeconds: number,
  requireWatermarkAtOrAfterStart: boolean
): CatalogSyncEvidence | null {
  if (states.length !== 1) return null;

  const state = states[0];
  const latestTime = state.latestTime?.trim() ?? "";
  const startedAtMilliseconds = state.lastStartedAt?.getTime() ?? Number.NaN;
  const completedAtMilliseconds = state.lastCompletedAt?.getTime() ?? Number.NaN;
  const latestTimeMilliseconds = Date.parse(latestTime);
  const nowMilliseconds = Date.now();
  if (
    state.environment !== expectedEnvironment ||
    !latestTime ||
    !Number.isFinite(latestTimeMilliseconds) ||
    !Number.isFinite(startedAtMilliseconds) ||
    !Number.isFinite(completedAtMilliseconds) ||
    completedAtMilliseconds < startedAtMilliseconds ||
    latestTimeMilliseconds > completedAtMilliseconds ||
    (requireWatermarkAtOrAfterStart && latestTimeMilliseconds < startedAtMilliseconds) ||
    completedAtMilliseconds > nowMilliseconds ||
    nowMilliseconds - completedAtMilliseconds > maximumAgeSeconds * 1_000 ||
    state.lastError !== null ||
    state.lockedAt !== null ||
    state.lockToken !== null
  ) {
    return null;
  }

  return state;
}

function jsonObject(value: Prisma.JsonValue | undefined): Record<string, Prisma.JsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : null;
}

function jsonStringArray(value: Prisma.JsonValue | Record<string, Prisma.JsonValue> | null | undefined, key: string) {
  const nested = jsonObject(value as Prisma.JsonValue | undefined)?.[key];
  return Array.isArray(nested) ? nested.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())) : [];
}

function jsonBoolean(value: Prisma.JsonValue | Record<string, Prisma.JsonValue> | null | undefined, key: string) {
  return jsonObject(value as Prisma.JsonValue | undefined)?.[key] === true;
}

function jsonString(value: Prisma.JsonValue | Record<string, Prisma.JsonValue> | null | undefined, key: string) {
  const nested = jsonObject(value as Prisma.JsonValue | undefined)?.[key];
  return typeof nested === "string" && nested.trim() ? nested.trim() : "";
}

function imageIdsForVariation(variationRaw: Prisma.JsonValue, itemRaw: Prisma.JsonValue) {
  const variationData = jsonObject(variationRaw)?.itemVariationData;
  const itemData = jsonObject(itemRaw)?.itemData;
  return uniqueStrings([
    ...jsonStringArray(variationData as Prisma.JsonValue, "imageIds"),
    ...jsonStringArray(variationRaw, "imageIds"),
    jsonString(variationRaw, "imageId"),
    ...jsonStringArray(itemData as Prisma.JsonValue, "imageIds"),
    ...jsonStringArray(itemRaw, "imageIds"),
    jsonString(itemRaw, "imageId")
  ]);
}

function imageUrlFromRaw(raw: Prisma.JsonValue | undefined) {
  const imageData = jsonObject(raw)?.imageData;
  const url = jsonObject(imageData as Prisma.JsonValue | undefined)?.url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function categoryNameFromRaw(raw: Prisma.JsonValue | undefined) {
  const categoryData = jsonObject(raw)?.categoryData;
  const name = jsonObject(categoryData as Prisma.JsonValue | undefined)?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function moneyAmount(value: Prisma.JsonValue | null) {
  const amount = jsonObject(value ?? undefined)?.amount;
  const numeric = typeof amount === "number" ? amount : typeof amount === "string" ? Number(amount) : Number.NaN;
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function squareStorefrontSlug(itemName: string, variationId: string) {
  const base = itemName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "square-product";
  const suffix = variationId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "item";
  return `${base}-${suffix}`;
}
