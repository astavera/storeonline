import "server-only";

import { SquareClient, SquareEnvironment, type CatalogObject } from "square";
import { env } from "@/lib/validation/env";

export type SquareCatalogEnvironment = "sandbox" | "production";

export type SquareCatalogAuditOptions = {
  accessToken: string;
  environment: SquareCatalogEnvironment;
  maxPages?: number;
};

export type SquareVendorReference = {
  id: string;
  name: string;
  status: string;
};

export type SquareLocationReference = {
  id: string;
  name: string;
  status: string;
  type: string;
  phone: string | null;
  addressLine1: string | null;
  locality: string | null;
  administrativeDistrict: string | null;
  postalCode: string | null;
};

export async function readConfiguredSquareLocationsReadOnly(): Promise<SquareLocationReference[]> {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("SQUARE_ACCESS_TOKEN is required for the location audit.");
  if (env.SQUARE_ENVIRONMENT === "production" && env.SQUARE_ALLOW_PRODUCTION_READONLY_SYNC !== "true") {
    throw new Error("Square production read-only access is not approved.");
  }
  const client = createSquareClient(accessToken, env.SQUARE_ENVIRONMENT);
  const response = await client.locations.list();
  return (response.locations ?? []).filter((location) => Boolean(location.id)).map((location) => ({
    id: location.id as string,
    name: location.name?.trim() || "Unnamed location",
    status: location.status ?? "UNKNOWN",
    type: location.type ?? "UNKNOWN",
    phone: location.phoneNumber?.trim() || null,
    addressLine1: location.address?.addressLine1?.trim() || null,
    locality: location.address?.locality?.trim() || null,
    administrativeDistrict: location.address?.administrativeDistrictLevel1?.trim() || null,
    postalCode: location.address?.postalCode?.trim() || null
  })).sort((left, right) => left.name.localeCompare(right.name));
}

export async function readConfiguredSquareVendorsReadOnly(): Promise<SquareVendorReference[]> {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!accessToken) return [];

  try {
    const client = createSquareClient(accessToken, env.SQUARE_ENVIRONMENT);
    const vendors: SquareVendorReference[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      const response = await client.vendors.search({
        filter: { status: ["ACTIVE", "INACTIVE"] },
        ...(cursor ? { cursor } : {})
      });
      vendors.push(...(response.vendors ?? [])
        .filter((vendor) => vendor.id && vendor.name && vendor.status !== "INACTIVE")
        .map((vendor) => ({ id: vendor.id as string, name: vendor.name as string, status: vendor.status ?? "UNKNOWN" })));
      cursor = response.cursor;
      pageCount += 1;
    } while (cursor && pageCount < 20);

    return vendors.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export type SquareCatalogAudit = {
  environment: SquareCatalogEnvironment;
  pagesRead: number;
  hasMoreItems: boolean;
  locations: Array<{
    id: string;
    name: string;
    status: string;
    type: string;
  }>;
  itemCount: number;
  variationCount: number;
  pricedVariationCount: number;
  inventoryTrackedVariationCount: number;
  itemsWithDescriptionCount: number;
  itemsWithImagesCount: number;
  sample: Array<{
    itemId: string;
    name: string;
    variationCount: number;
    firstPriceAmount: string | null;
    currency: string | null;
  }>;
};

export async function auditSquareCatalogReadOnly(options: SquareCatalogAuditOptions): Promise<SquareCatalogAudit> {
  const accessToken = options.accessToken.trim();

  if (!accessToken) {
    throw new Error("SQUARE_ACCESS_TOKEN is required for the live catalog audit.");
  }

  const maxPages = normalizeMaxPages(options.maxPages);
  const client = createSquareClient(accessToken, options.environment);
  const locationResponse = await client.locations.list();
  const locations = (locationResponse.locations ?? []).map((location) => ({
    id: location.id ?? "",
    name: location.name ?? "Unnamed location",
    status: location.status ?? "UNKNOWN",
    type: location.type ?? "UNKNOWN"
  }));

  const normalizedItems: ReturnType<typeof normalizeSquareCatalogItem>[] = [];
  const page = await client.catalog.list({ types: "ITEM" });
  let pagesRead = 0;

  while (pagesRead < maxPages) {
    normalizedItems.push(...page.data.filter(isCatalogItem).map(normalizeSquareCatalogItem));
    pagesRead += 1;

    if (pagesRead >= maxPages || !page.hasNextPage()) {
      break;
    }

    await page.getNextPage();
  }

  const variations = normalizedItems.flatMap((item) => item.variations);

  return {
    environment: options.environment,
    pagesRead,
    hasMoreItems: page.hasNextPage(),
    locations,
    itemCount: normalizedItems.length,
    variationCount: variations.length,
    pricedVariationCount: variations.filter((variation) => variation.priceAmount !== null).length,
    inventoryTrackedVariationCount: variations.filter((variation) => variation.trackInventory).length,
    itemsWithDescriptionCount: normalizedItems.filter((item) => item.hasDescription).length,
    itemsWithImagesCount: normalizedItems.filter((item) => item.imageCount > 0).length,
    sample: normalizedItems.slice(0, 5).map((item) => ({
      itemId: item.id,
      name: item.name,
      variationCount: item.variations.length,
      firstPriceAmount: item.variations[0]?.priceAmount ?? null,
      currency: item.variations[0]?.currency ?? null
    }))
  };
}

export function normalizeSquareCatalogItem(item: CatalogObject.Item) {
  const itemData = item.itemData;
  const variations = (itemData?.variations ?? []).filter(isCatalogVariation).map((variation) => {
    const variationData = variation.itemVariationData;
    const soldOutLocationIds = (variationData?.locationOverrides ?? [])
      .filter((override) => override.soldOut === true && override.locationId)
      .map((override) => override.locationId as string);

    return {
      id: variation.id,
      name: variationData?.name?.trim() || "Default",
      sku: variationData?.sku?.trim() || null,
      upc: variationData?.upc?.trim() || null,
      priceAmount: variationData?.priceMoney?.amount?.toString() ?? null,
      currency: variationData?.priceMoney?.currency ?? null,
      trackInventory: variationData?.trackInventory === true,
      sellable: variationData?.sellable !== false,
      stockable: variationData?.stockable === true,
      presentAtAllLocations: variation.presentAtAllLocations !== false,
      presentAtLocationIds: variation.presentAtLocationIds ?? [],
      soldOutLocationIds
    };
  });

  return {
    id: item.id,
    name: itemData?.name?.trim() || "Unnamed item",
    hasDescription: Boolean(itemData?.descriptionPlaintext?.trim() || itemData?.descriptionHtml?.trim() || itemData?.description?.trim()),
    imageCount: new Set([...(itemData?.imageIds ?? []), ...(item.imageId ? [item.imageId] : [])]).size,
    categoryIds: Array.from(new Set([...(itemData?.categories ?? []).map((category) => category.id), ...(itemData?.categoryId ? [itemData.categoryId] : [])])),
    isArchived: itemData?.isArchived === true,
    presentAtAllLocations: item.presentAtAllLocations !== false,
    presentAtLocationIds: item.presentAtLocationIds ?? [],
    variations
  };
}

function isCatalogItem(object: CatalogObject): object is CatalogObject.Item {
  return object.type === "ITEM";
}

function isCatalogVariation(object: CatalogObject): object is CatalogObject.ItemVariation {
  return object.type === "ITEM_VARIATION";
}

function normalizeMaxPages(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 2;
  }

  return Math.min(10, Math.max(1, Math.trunc(value as number)));
}

function createSquareClient(accessToken: string, environment: SquareCatalogEnvironment) {
  return new SquareClient({
    token: accessToken,
    environment: environment === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });
}
