/**
 * Synchronizes the approved read-only Square catalog projection into PostgreSQL.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

loadEnvironment();

const cliArguments = process.argv.slice(2);
validateCliArguments(cliArguments);
const checkOnly = cliArguments.includes("--check");
const statusOnly = cliArguments.includes("--status");
const recoverCatalogLease = cliArguments.includes("--recover-catalog-lease");
const checkoutReadiness = cliArguments.includes("--checkout-readiness");
const locationsOnly = cliArguments.includes("--locations");
const applyLocations = cliArguments.includes("--apply-locations");
const confirmationIndex = cliArguments.indexOf("--confirm");
const confirmation = confirmationIndex >= 0 ? cliArguments[confirmationIndex + 1] ?? "" : "";
const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";
const productionReadOnlyApproved = process.env.SQUARE_ALLOW_PRODUCTION_READONLY_SYNC === "true";
const accessTokenConfigured = Boolean(process.env.SQUARE_ACCESS_TOKEN?.trim());

if (checkOnly) {
  console.log(JSON.stringify({
    mode: "configuration-check",
    environment,
    productionReadOnlyApproved,
    accessTokenConfigured,
    squareWritesEnabled: false,
    paymentsEnabled: false
  }, null, 2));
  process.exit(accessTokenConfigured && (environment !== "production" || productionReadOnlyApproved) ? 0 : 1);
}

if (statusOnly) {
  await reportStatus(environment);
  process.exit();
}

if (checkoutReadiness) {
  try {
    const [
      { readMappedOperationalStoreLocations, readPostgresInventorySyncSummary, readPostgresStorefrontProductsByVariationIds },
      { readLatestDatabaseCmsVersion },
      { parseWebsiteMerchandising },
      { resolveWebsiteCatalog },
      { quoteCartWithProducts }
    ] = await Promise.all([
      import("@/server/square/postgres-catalog-store"),
      import("@/server/db/cms-version-repository"),
      import("@/server/admin/website-merchandising-store"),
      import("@/features/catalog/services/website-merchandising-service"),
      import("@/server/checkout/cart-service")
    ]);
    const [locations, inventory, contentRecord] = await Promise.all([
      readMappedOperationalStoreLocations(),
      readPostgresInventorySyncSummary(),
      readLatestDatabaseCmsVersion({
        entityType: "WEBSITE_MERCHANDISING",
        entityId: "global",
        statuses: ["PUBLISHED", "PREVIEW", "DRAFT"]
      })
    ]);
    const inventoryCompletedAt = inventory.lastCompletedAt ? Date.parse(inventory.lastCompletedAt) : Number.NaN;
    if (!inventory.available || Number.isNaN(inventoryCompletedAt) || inventoryCompletedAt < Date.now() - 30 * 60_000) {
      throw new Error("Fresh Square inventory availability is required for checkout readiness.");
    }
    const config = parseWebsiteMerchandising(contentRecord?.payload);
    if (!contentRecord || !config) throw new Error("No valid website merchandising version is available for checkout readiness.");
    const visibleVariationIds = config.placements.filter((placement) => placement.visible).map((placement) => placement.squareVariationId);
    const results = await Promise.all(locations.map(async (location) => {
      const productsForLocation = await readPostgresStorefrontProductsByVariationIds(visibleVariationIds, {
        squareLocationIds: [location.squareLocationId]
      });
      const resolvedCatalog = resolveWebsiteCatalog(productsForLocation, config);
      const supportedModes: Array<"pickup" | "local-delivery" | "shipping"> = [];
      if (location.pickupEnabled) supportedModes.push("pickup");
      if (location.localDeliveryEnabled) supportedModes.push("local-delivery");
      if (location.shippingFulfillmentEnabled) supportedModes.push("shipping");
      const products = resolvedCatalog.products;
      const eligible = products
        .filter((product) => product.priceAvailable !== false)
        .filter((product) => !product.inventoryTracked || (product.availableQuantity ?? 0) >= 1)
        .filter((product) => product.fulfillmentModes.some((mode) => supportedModes.includes(mode)))
        .sort((left, right) => Number(Boolean(right.inventoryTracked)) - Number(Boolean(left.inventoryTracked)) || left.name.localeCompare(right.name));
      const sample = eligible[0];
      const quote = sample
        ? quoteCartWithProducts(
          { items: [{ squareVariationId: sample.squareVariationId, quantity: 1 }], locationId: location.id },
          [sample],
          {
            catalogSource: "postgres",
            inventoryAsOf: inventory.latestTime ?? inventory.lastCompletedAt,
            warnings: [],
            location
          }
        )
        : null;
      return {
        location: { id: location.id, name: location.name, squareLocationId: location.squareLocationId },
        visibleProducts: products.length,
        pricedProducts: products.filter((product) => product.priceAvailable !== false).length,
        inStockTrackedProducts: products.filter((product) => product.inventoryTracked && (product.availableQuantity ?? 0) >= 1).length,
        checkoutEligibleProducts: eligible.length,
        sample: sample ? {
          squareVariationId: sample.squareVariationId,
          name: sample.name,
          availableQuantity: sample.availableQuantity ?? null,
          inventoryTracked: Boolean(sample.inventoryTracked),
          compatibleFulfillmentModes: quote?.compatibleFulfillmentModes ?? [],
          quoteErrors: quote?.errors ?? [],
          inventoryAsOf: quote?.inventoryAsOf ?? null
        } : null,
        ready: Boolean(sample && quote && quote.errors.length === 0 && quote.compatibleFulfillmentModes.length > 0)
      };
    }));
    console.log(JSON.stringify({
      mode: "square-checkout-readiness-read-only",
      environment,
      contentStatus: contentRecord.status,
      contentVersion: contentRecord.versionNumber,
      runtimePublished: contentRecord.status === "PUBLISHED",
      squareWritesEnabled: false,
      squareOrderCreated: false,
      paymentCaptured: false,
      locations: results
    }, null, 2));
    if (contentRecord.status !== "PUBLISHED" || results.length === 0 || results.some((result) => !result.ready)) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      mode: "square-checkout-readiness-read-only",
      ok: false,
      error: sanitize(describeError(error, "Square checkout readiness audit failed."))
    }, null, 2));
    process.exitCode = 1;
  }
  process.exit();
}

if (recoverCatalogLease) {
  const requiredConfirmation = "abandoned-square-catalog-sync-v1";
  if (confirmation !== requiredConfirmation) {
    console.error(JSON.stringify({
      mode: "square-catalog-lease-recovery",
      ok: false,
      error: `Confirmation must be ${requiredConfirmation}.`
    }, null, 2));
    process.exit(1);
  }
  try {
    const { getPrismaClient } = await import("@/server/db/prisma");
    const prisma = getPrismaClient();
    const state = await prisma.squareCatalogSyncState.findUnique({ where: { environment } });
    if (!state?.lockedAt || !state.lockToken) {
      console.log(JSON.stringify({ mode: "square-catalog-lease-recovery", recovered: 0, reason: "not-locked" }, null, 2));
      process.exit();
    }
    const staleBefore = new Date(Date.now() - 60_000);
    if (state.lockedAt > staleBefore) throw new Error("The catalog lease is less than 60 seconds old and cannot be recovered yet.");
    const recovered = await prisma.squareCatalogSyncState.updateMany({
      where: { environment, lockToken: state.lockToken, lockedAt: state.lockedAt },
      data: {
        lockedAt: null,
        lockToken: null,
        lastError: "Recovered abandoned CLI lease after the parent shell timed out."
      }
    });
    console.log(JSON.stringify({ mode: "square-catalog-lease-recovery", recovered: recovered.count }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      mode: "square-catalog-lease-recovery",
      ok: false,
      error: sanitize(describeError(error, "Square catalog lease recovery failed."))
    }, null, 2));
    process.exitCode = 1;
  }
  process.exit();
}

if (locationsOnly) {
  try {
    const { auditSquareLocationMappingsReadOnly } = await import("@/server/square/location-reconciliation");
    console.log(JSON.stringify(await auditSquareLocationMappingsReadOnly(), null, 2));
  } catch (error) {
    const message = describeError(error, "Square location audit failed.");
    console.error(JSON.stringify({ mode: "square-location-read-only-audit", ok: false, error: sanitize(message) }, null, 2));
    process.exitCode = 1;
  }
  process.exit();
}

if (applyLocations) {
  try {
    const { applyReviewedSquareLocationMappings } = await import("@/server/square/location-reconciliation");
    const result = await applyReviewedSquareLocationMappings(confirmation);
    console.log(JSON.stringify({ mode: "square-location-mapping-apply", squareWritesEnabled: false, ...result }, null, 2));
  } catch (error) {
    const message = describeError(error, "Square location mapping failed.");
    console.error(JSON.stringify({ mode: "square-location-mapping-apply", ok: false, error: sanitize(message) }, null, 2));
    process.exitCode = 1;
  }
  process.exit();
}

let synchronizationSucceeded = false;
try {
  const { syncConfiguredSquareCatalogChanges } = await import("@/server/square/catalog-postgres-sync");
  const { syncConfiguredSquareInventoryCounts } = await import("@/server/square/inventory-postgres-sync");
  const catalog = await syncConfiguredSquareCatalogChanges({
    onProgress(progress) {
      console.log(JSON.stringify({ stage: "catalog", ...progress }));
    }
  });
  const inventory = await syncConfiguredSquareInventoryCounts({
    onProgress(progress) {
      console.log(JSON.stringify({ stage: "inventory", ...progress }));
    }
  });
  console.log(JSON.stringify({
    mode: "square-read-only-postgres-sync",
    environment,
    squareWritesEnabled: false,
    paymentsEnabled: false,
    catalog,
    inventory
  }, null, 2));
  synchronizationSucceeded = true;
} catch (error) {
  const message = describeError(error, "Square read-only synchronization failed.");
  console.error(JSON.stringify({
    mode: "square-read-only-postgres-sync",
    environment,
    ok: false,
    error: sanitize(message)
  }, null, 2));
  process.exitCode = 1;
}

if (synchronizationSucceeded) await reportStatus(environment);

async function reportStatus(activeEnvironment: string) {
  try {
    const [
      { getPrismaClient },
      { readPostgresCatalogSummary, readPostgresInventorySyncSummary },
      { assessSquarePostgresSyncStatus },
      { env }
    ] = await Promise.all([
      import("@/server/db/prisma"),
      import("@/server/square/postgres-catalog-store"),
      import("@/server/square/postgres-sync-status"),
      import("@/lib/validation/env")
    ]);
    const prisma = getPrismaClient();
    const [catalog, inventory, inventoryRows, states, locations] = await Promise.all([
      readPostgresCatalogSummary(),
      readPostgresInventorySyncSummary(),
      prisma.squareInventoryCount.count(),
      prisma.squareCatalogSyncState.findMany({
        orderBy: { environment: "asc" },
        select: {
          environment: true,
          latestTime: true,
          lastStartedAt: true,
          lastCompletedAt: true,
          lastError: true,
          lockedAt: true,
          lockToken: true
        }
      }),
      prisma.storeLocation.findMany({
        orderBy: { slug: "asc" },
        select: { id: true, name: true, squareLocationId: true }
      })
    ]);
    const status = assessSquarePostgresSyncStatus({
      environment: env.SQUARE_ENVIRONMENT,
      catalogMaximumAgeSeconds: env.SQUARE_CATALOG_SYNC_MAX_AGE_SECONDS,
      inventoryMaximumAgeSeconds: env.SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS,
      catalog,
      inventory: { ...inventory, rows: inventoryRows },
      states
    });
    console.log(JSON.stringify({
      mode: "square-postgres-read-only-status",
      environment: activeEnvironment,
      ok: status.ok,
      failures: status.failures,
      squareWritesEnabled: false,
      catalog,
      inventory: { ...inventory, rows: inventoryRows },
      states,
      locations
    }, null, 2));
    if (!status.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      mode: "square-postgres-read-only-status",
      ok: false,
      error: sanitize(describeError(error, "Square PostgreSQL status failed."))
    }, null, 2));
    process.exitCode = 1;
  }
}

function loadEnvironment() {
  if (process.env.SQUARE_SYNC_EXTERNAL_ENV_ONLY === "true") return;
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function sanitize(value: string) {
  return value.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s@]+@/gi, "[redacted-url]").slice(0, 500);
}

function describeError(error: unknown, fallback: string) {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current.message && !messages.includes(current.message)) messages.push(current.message);
    current = current.cause;
  }
  return messages.length > 0 ? messages.join(" Caused by: ") : fallback;
}

function validateCliArguments(values: string[]) {
  const modeFlags = [
    "--sync",
    "--check",
    "--status",
    "--recover-catalog-lease",
    "--checkout-readiness",
    "--locations",
    "--apply-locations"
  ];
  const knownFlags = new Set([...modeFlags, "--confirm"]);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!knownFlags.has(value)) failInvalidCli(`Unknown option: ${value}`);
    if (value === "--confirm") {
      const confirmationValue = values[index + 1];
      if (!confirmationValue || confirmationValue.startsWith("--")) failInvalidCli("--confirm requires a value.");
      index += 1;
    }
  }
  const selectedModes = modeFlags.filter((flag) => values.includes(flag));
  if (selectedModes.length > 1) failInvalidCli(`Choose only one mode: ${selectedModes.join(", ")}`);
}

function failInvalidCli(message: string): never {
  console.error(JSON.stringify({ mode: "invalid-cli", ok: false, error: message }, null, 2));
  process.exit(1);
}
