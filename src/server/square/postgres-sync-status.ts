/**
 * Evaluates persisted Square catalog and inventory evidence for operator status.
 */

import "server-only";

import type {
  PostgresCatalogSummary,
  PostgresInventorySyncSummary
} from "@/server/square/postgres-catalog-store";

export type SquarePostgresSyncStatusState = {
  environment: string;
  latestTime: string | null;
  lastStartedAt: Date | null;
  lastCompletedAt: Date | null;
  lastError: string | null;
  lockedAt: Date | null;
  lockToken: string | null;
};

export type SquarePostgresSyncStatusAssessment = {
  ok: boolean;
  failures: string[];
};

const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

export function assessSquarePostgresSyncStatus(input: {
  environment: "sandbox" | "production";
  catalogMaximumAgeSeconds: number;
  inventoryMaximumAgeSeconds: number;
  catalog: PostgresCatalogSummary;
  inventory: PostgresInventorySyncSummary & { rows: number };
  states: SquarePostgresSyncStatusState[];
  now?: Date;
}): SquarePostgresSyncStatusAssessment {
  const failures = new Set<string>();
  const now = input.now ?? new Date();
  const expectedCatalogEnvironment = input.environment;
  const expectedInventoryEnvironment = `${input.environment}:inventory`;
  const statesByEnvironment = new Map(input.states.map((state) => [state.environment, state]));

  if (input.states.length !== 2 || statesByEnvironment.size !== 2) failures.add("unexpected_sync_state_set");
  for (const environment of statesByEnvironment.keys()) {
    if (environment !== expectedCatalogEnvironment && environment !== expectedInventoryEnvironment) {
      failures.add("unexpected_sync_state_set");
    }
  }

  const catalogState = statesByEnvironment.get(expectedCatalogEnvironment);
  const inventoryState = statesByEnvironment.get(expectedInventoryEnvironment);
  validateState({
    state: catalogState,
    label: "catalog",
    maximumAgeSeconds: input.catalogMaximumAgeSeconds,
    requireWatermarkAtOrAfterStart: false,
    now,
    failures
  });
  validateState({
    state: inventoryState,
    label: "inventory",
    maximumAgeSeconds: input.inventoryMaximumAgeSeconds,
    requireWatermarkAtOrAfterStart: true,
    now,
    failures
  });

  if (!input.catalog.available) failures.add("catalog_unavailable");
  if (input.catalog.environment !== expectedCatalogEnvironment) failures.add("catalog_environment_mismatch");
  if (!Number.isSafeInteger(input.catalog.itemCount) || input.catalog.itemCount <= 0) failures.add("catalog_items_missing");
  if (!Number.isSafeInteger(input.catalog.variationCount) || input.catalog.variationCount <= 0) failures.add("catalog_variations_missing");
  if (!timestampMatches(input.catalog.updatedAt, catalogState?.lastCompletedAt)) failures.add("catalog_summary_mismatch");

  if (!input.inventory.available) failures.add("inventory_unavailable");
  if (!Number.isSafeInteger(input.inventory.rows) || input.inventory.rows <= 0) failures.add("inventory_rows_missing");
  if (
    !Number.isSafeInteger(input.inventory.totalOperationalLocations) ||
    input.inventory.totalOperationalLocations <= 0 ||
    input.inventory.mappedOperationalLocations !== input.inventory.totalOperationalLocations
  ) {
    failures.add("operational_locations_incomplete");
  }
  if (!timestampMatches(input.inventory.lastCompletedAt, inventoryState?.lastCompletedAt)) {
    failures.add("inventory_summary_mismatch");
  }
  if (input.inventory.latestTime !== inventoryState?.latestTime) failures.add("inventory_summary_mismatch");

  return { ok: failures.size === 0, failures: Array.from(failures).sort() };
}

function validateState(input: {
  state: SquarePostgresSyncStatusState | undefined;
  label: "catalog" | "inventory";
  maximumAgeSeconds: number;
  requireWatermarkAtOrAfterStart: boolean;
  now: Date;
  failures: Set<string>;
}) {
  const { state, label, maximumAgeSeconds, requireWatermarkAtOrAfterStart, now, failures } = input;
  if (!state) {
    failures.add(`${label}_state_missing`);
    return;
  }

  const startedAt = state.lastStartedAt?.getTime() ?? Number.NaN;
  const completedAt = state.lastCompletedAt?.getTime() ?? Number.NaN;
  const watermark = parseRfc3339(state.latestTime);
  const nowMilliseconds = now.getTime();
  const maximumAgeMilliseconds = maximumAgeSeconds * 1_000;

  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    failures.add(`${label}_timestamps_invalid`);
  }
  if (!Number.isFinite(watermark) || watermark > completedAt) failures.add(`${label}_watermark_invalid`);
  if (requireWatermarkAtOrAfterStart && watermark < startedAt) failures.add(`${label}_watermark_invalid`);
  if (
    !Number.isSafeInteger(maximumAgeSeconds) ||
    maximumAgeSeconds < 60 ||
    !Number.isFinite(nowMilliseconds) ||
    completedAt > nowMilliseconds ||
    nowMilliseconds - completedAt > maximumAgeMilliseconds
  ) {
    failures.add(`${label}_state_stale`);
  }
  if (state.lastError !== null) failures.add(`${label}_state_failed`);
  if (state.lockedAt !== null || state.lockToken !== null) failures.add(`${label}_state_locked`);
}

function parseRfc3339(value: string | null) {
  if (!value || !rfc3339Pattern.test(value)) return Number.NaN;
  return Date.parse(value);
}

function timestampMatches(value: string | null, expected: Date | null | undefined) {
  return Boolean(value && expected && Number.isFinite(expected.getTime()) && value === expected.toISOString());
}
