/**
 * Implements server-side cart service behavior and persistence boundaries.
 */

import "server-only";
import { z } from "zod";
import {
  fulfillmentModeLabel,
  storefrontProducts,
  type FulfillmentMode,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";
import {
  latexBalloonAddOnVariationIds,
  latexBalloonOrderVariationIds
} from "@/config/balloons.config";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import {
  readMappedOperationalStoreLocations,
  readPostgresInventorySyncSummary,
  type OperationalStoreLocation
} from "@/server/square/postgres-catalog-store";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export const cartItemInputSchema = z.object({
  squareVariationId: z.string().min(1),
  quantity: z.number().int().positive().max(99),
  source: z.enum(["storefront", "balloons"]).optional()
});

export type CheckoutGroupKind = "regular" | "balloons";

export const cartQuoteInputSchema = z.object({
  items: z.array(cartItemInputSchema).max(50),
  locationId: z.string().trim().min(1).max(160).optional()
});

export type CartQuoteLine = {
  squareVariationId: string;
  slug: string;
  name: string;
  department: string;
  imageUrl: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  fulfillmentModes: FulfillmentMode[];
  inventoryTracked: boolean;
  availableQuantity: number | null;
  checkoutGroup?: CheckoutGroupKind;
};

export type CheckoutGroupQuote = {
  id: CheckoutGroupKind;
  label: string;
  lines: CartQuoteLine[];
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  totalCents: number;
  compatibleFulfillmentModes: FulfillmentMode[];
};

export type CartQuote = {
  lines: CartQuoteLine[];
  checkoutGroups: CheckoutGroupQuote[];
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  taxEstimateIncluded?: boolean;
  totalCents: number;
  compatibleFulfillmentModes: FulfillmentMode[];
  fulfillmentLabel: string;
  errors: string[];
  warnings: string[];
  catalogSource: "postgres" | "legacy-sqlite" | "preview" | "static-preview";
  inventoryAsOf: string | null;
  locationId: string | null;
  locationName: string | null;
  availabilityScope: "selected-location" | "mapped-locations" | "static-preview";
};

type CartQuoteMetadata = Pick<CartQuote, "catalogSource" | "inventoryAsOf" | "warnings"> & {
  location?: OperationalStoreLocation;
  estimatedTaxRate?: number;
  showTaxEstimate?: boolean;
  orderProInventoryCheckoutGroups?: ReadonlySet<CheckoutGroupKind>;
};

const estimatedTaxRate = 0.08875;
const configuredBalloonVariationIds = new Set<string>([
  ...latexBalloonOrderVariationIds,
  latexBalloonAddOnVariationIds.hiFloat,
  ...latexBalloonAddOnVariationIds.weights
]);

export function calculateCartQuantity(items: Array<z.infer<typeof cartItemInputSchema>>) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function quoteCart(input: z.infer<typeof cartQuoteInputSchema>): CartQuote {
  return quoteCartWithProducts(input, storefrontProducts, {
    catalogSource: "static-preview",
    inventoryAsOf: null,
    warnings: []
  });
}

type OperationalCartQuoteOptions = {
  readonly orderProShippingCheckoutGroups?: readonly CheckoutGroupKind[];
};

export async function quoteCartFromOperationalCatalog(
  input: z.infer<typeof cartQuoteInputSchema>,
  options: OperationalCartQuoteOptions = {}
): Promise<CartQuote> {
  const parsed = cartQuoteInputSchema.parse(input);
  const orderProShippingCheckoutGroups = new Set(options.orderProShippingCheckoutGroups ?? []);
  const operationalLocations = await readMappedOperationalStoreLocations();
  const selectedLocation = parsed.locationId
    ? operationalLocations.find((location) => location.id === parsed.locationId)
    : undefined;
  if (parsed.locationId && !selectedLocation) {
    throw new Error("The selected fulfillment location is unavailable or is not mapped to Square.");
  }
  const source = await readResolvedSquareWebsiteCatalog({
    squareLocationIds: selectedLocation
      ? [selectedLocation.squareLocationId]
      : operationalLocations.map((location) => location.squareLocationId),
    requireFreshInventory: orderProShippingCheckoutGroups.size === 0
  });
  if (!source) {
    if (process.env.E2E_CATALOG_FIXTURE === "true") {
      return quoteCartWithProducts(parsed, storefrontProducts, {
        catalogSource: "static-preview",
        inventoryAsOf: null,
        warnings: [],
        ...(selectedLocation ? { location: selectedLocation } : {})
      });
    }
    throw new PersistenceUnavailableError("Square operational catalog");
  }
  const requestedIds = new Set(parsed.items.map((item) => item.squareVariationId));
  const products = source.catalog.products.filter((product) => requestedIds.has(product.squareVariationId));
  const productsByVariationId = new Map(products.map((product) => [product.squareVariationId, product]));
  const usesOrderProInventory = (item: z.infer<typeof cartItemInputSchema>) => {
    const product = productsByVariationId.get(item.squareVariationId);
    return Boolean(product && orderProShippingCheckoutGroups.has(checkoutGroupForProduct(product, item.source)));
  };
  const warnings: string[] = [];
  let inventoryAsOf: string | null = null;

  if (parsed.items.some((item) => productsByVariationId.get(item.squareVariationId)?.inventoryTracked && !usesOrderProInventory(item))) {
    const inventory = await readPostgresInventorySyncSummary();
    const completedAt = inventory.lastCompletedAt ? Date.parse(inventory.lastCompletedAt) : Number.NaN;
    if (!inventory.available || Number.isNaN(completedAt) || completedAt < Date.now() - 30 * 60_000) {
      throw new PersistenceUnavailableError("Fresh Square inventory availability");
    }
    inventoryAsOf = inventory.latestTime ?? inventory.lastCompletedAt;
    if (!selectedLocation && inventory.mappedOperationalLocations > 1) {
      warnings.push("Availability is combined across mapped stores until a fulfillment location is selected.");
    }
    if (inventory.totalOperationalLocations === 0 || inventory.mappedOperationalLocations < inventory.totalOperationalLocations) {
      warnings.push("Availability is aggregated across Square locations until every operational store has a Square location mapping.");
    }
  }
  if (parsed.items.some(usesOrderProInventory)) {
    warnings.push("Shipping availability is verified directly by OrderPRO before rates and again before Square checkout.");
  }

  return quoteCartWithProducts(parsed, products, {
    catalogSource: source.source,
    inventoryAsOf,
    warnings,
    orderProInventoryCheckoutGroups: orderProShippingCheckoutGroups,
    ...(selectedLocation ? { location: selectedLocation } : {})
  });
}

export function quoteCartWithProducts(
  input: z.infer<typeof cartQuoteInputSchema>,
  products: StorefrontProduct[],
  metadata: CartQuoteMetadata = {
    catalogSource: "static-preview",
    inventoryAsOf: null,
    warnings: []
  }
): CartQuote {
  const parsed = cartQuoteInputSchema.parse(input);
  const errors: string[] = [];
  const productsByVariationId = new Map(products.map((product) => [product.squareVariationId, product]));
  const lines = parsed.items.flatMap((item): CartQuoteLine[] => {
    const product = productsByVariationId.get(item.squareVariationId);

    if (!product) {
      errors.push("One or more items in your cart are no longer available. Please update your cart and try again.");
      return [];
    }
    if (product.priceAvailable === false) {
      errors.push("One or more items do not currently have a purchasable Square price.");
      return [];
    }
    const checkoutGroup = checkoutGroupForProduct(product, item.source);
    const inventoryTracked = Boolean(product.inventoryTracked)
      && !metadata.orderProInventoryCheckoutGroups?.has(checkoutGroup);
    const availableQuantity = inventoryTracked ? Math.max(0, product.availableQuantity ?? 0) : null;
    if (inventoryTracked && availableQuantity! < item.quantity) {
      errors.push("One or more items do not have enough current Square inventory for the requested quantity.");
    }

    return [
      {
        squareVariationId: product.squareVariationId,
        slug: product.slug,
        name: product.name,
        department: product.department,
        imageUrl: product.imageUrl,
        unitPriceCents: product.priceCents,
        quantity: item.quantity,
        lineTotalCents: product.priceCents * item.quantity,
        fulfillmentModes: product.fulfillmentModes,
        inventoryTracked,
        availableQuantity,
        checkoutGroup
      }
    ];
  });
  const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);
  const taxEstimateIncluded = metadata.showTaxEstimate !== false;
  const taxRate = metadata.estimatedTaxRate ?? estimatedTaxRate;
  const checkoutGroups = buildCheckoutGroups(lines, taxEstimateIncluded ? taxRate : 0, metadata.location);
  const estimatedTaxCents = checkoutGroups.reduce((total, group) => total + group.estimatedTaxCents, 0);
  const productFulfillmentModes = getCompatibleFulfillmentModes(lines);
  const compatibleFulfillmentModes = metadata.location
    ? productFulfillmentModes.filter((mode) => locationSupportsFulfillmentMode(metadata.location!, mode))
    : productFulfillmentModes;

  if (lines.length > 0 && checkoutGroups.some((group) => group.compatibleFulfillmentModes.length === 0)) {
    errors.push("This cart mixes products that cannot share one fulfillment method. Split the cart before checkout.");
  } else if (lines.length > 0 && metadata.location && compatibleFulfillmentModes.length === 0) {
    errors.push("The selected store does not support a fulfillment method shared by every item in this cart.");
  }

  return {
    lines,
    checkoutGroups,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents,
    estimatedTaxCents,
    taxEstimateIncluded,
    totalCents: subtotalCents + estimatedTaxCents,
    compatibleFulfillmentModes,
    fulfillmentLabel: compatibleFulfillmentModes.length > 0 ? compatibleFulfillmentModes.map(fulfillmentModeLabel).join(", ") : "Split required",
    errors: Array.from(new Set(errors)),
    warnings: metadata.warnings,
    catalogSource: metadata.catalogSource,
    inventoryAsOf: metadata.inventoryAsOf,
    locationId: metadata.location?.id ?? null,
    locationName: metadata.location?.name ?? null,
    availabilityScope: metadata.location
      ? "selected-location"
      : metadata.catalogSource === "static-preview"
        ? "static-preview"
        : "mapped-locations"
  };
}

function buildCheckoutGroups(
  lines: CartQuoteLine[],
  taxRate: number,
  location?: OperationalStoreLocation
): CheckoutGroupQuote[] {
  return (["regular", "balloons"] as const).flatMap((id) => {
    const groupLines = lines.filter((line) => line.checkoutGroup === id);
    if (groupLines.length === 0) return [];
    const subtotalCents = groupLines.reduce((total, line) => total + line.lineTotalCents, 0);
    const estimatedTaxCents = Math.round(subtotalCents * taxRate);
    const productModes = getCompatibleFulfillmentModes(groupLines);
    const compatibleFulfillmentModes = location
      ? productModes.filter((mode) => locationSupportsFulfillmentMode(location, mode))
      : productModes;
    return [{
      id,
      label: id === "balloons" ? "Balloons" : "Store items",
      lines: groupLines,
      itemCount: groupLines.reduce((total, line) => total + line.quantity, 0),
      subtotalCents,
      estimatedTaxCents,
      totalCents: subtotalCents + estimatedTaxCents,
      compatibleFulfillmentModes
    }];
  });
}

function checkoutGroupForProduct(
  product: StorefrontProduct,
  source: "storefront" | "balloons" | undefined
): CheckoutGroupKind {
  const department = product.department.trim().toLowerCase();
  const catalogRequiresBalloonHandling = department === "balloons"
    || department === "balloon"
    || department.includes("balloon")
    || configuredBalloonVariationIds.has(product.squareVariationId);
  return catalogRequiresBalloonHandling || source === "balloons" ? "balloons" : "regular";
}

export function locationSupportsFulfillmentMode(location: OperationalStoreLocation, mode: FulfillmentMode) {
  if (mode === "pickup") return location.pickupEnabled;
  if (mode === "local-delivery") return location.localDeliveryEnabled;
  return location.shippingFulfillmentEnabled;
}

function getCompatibleFulfillmentModes(lines: CartQuoteLine[]) {
  if (lines.length === 0) {
    return [];
  }

  const sharedModes = lines.reduce<FulfillmentMode[]>(
    (modes, line) => modes.filter((mode) => line.fulfillmentModes.includes(mode)),
    [...lines[0].fulfillmentModes]
  );
  return lines.some((line) => line.checkoutGroup === "balloons")
    ? sharedModes.filter((mode) => mode !== "shipping")
    : sharedModes;
}
