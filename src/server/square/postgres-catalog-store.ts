/**
 * Implements server-side postgres catalog store behavior and persistence boundaries.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
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

export async function readPostgresCatalogSummary(): Promise<PostgresCatalogSummary> {
  try {
    const [state, itemCount, variationCount] = await Promise.all([
      getPrismaClient().squareCatalogSyncState.findUnique({ where: { environment: env.SQUARE_ENVIRONMENT } }),
      getPrismaClient().squareCatalogObject.count({ where: { type: "ITEM", deletedAt: null } }),
      getPrismaClient().squareItemVariation.count({ where: { deletedAt: null, item: { deletedAt: null } } })
    ]);
    return {
      available: variationCount > 0,
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
    const [state, locations] = await Promise.all([
      getPrismaClient().squareCatalogSyncState.findUnique({
        where: { environment: `${env.SQUARE_ENVIRONMENT}:inventory` }
      }),
      getPrismaClient().storeLocation.findMany({
        where: { OR: [{ pickupEnabled: true }, { localDeliveryEnabled: true }, { shippingFulfillmentEnabled: true }] },
        select: { squareLocationId: true }
      })
    ]);
    return {
      available: Boolean(state?.lastCompletedAt && !state.lastError),
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
    const mappedLocations = await readMappedOperationalStoreLocations();
    const squareLocationIds = options.squareLocationIds ?? mappedLocations.map((location) => location.squareLocationId);
    const requestedLocationIds = new Set(squareLocationIds);
    const pickupLocations = mappedLocations.filter((location) => location.pickupEnabled && requestedLocationIds.has(location.squareLocationId));
    const variations = await getPrismaClient().squareItemVariation.findMany({
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
    const related = await getPrismaClient().squareCatalogObject.findMany({
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
        slug: squareStorefrontSlug(itemName, variation.id),
        name: displayName,
        department,
        shortDescription: description.slice(0, 180),
        description,
        imageUrl,
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
