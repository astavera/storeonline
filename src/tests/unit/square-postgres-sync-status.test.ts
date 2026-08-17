// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  assessSquarePostgresSyncStatus,
  type SquarePostgresSyncStatusState
} from "@/server/square/postgres-sync-status";

const startedAt = new Date("2026-08-17T12:00:00.000Z");
const completedAt = new Date("2026-08-17T12:05:00.000Z");
const now = new Date("2026-08-17T12:10:00.000Z");

function state(environment: "production" | "production:inventory"): SquarePostgresSyncStatusState {
  return {
    environment,
    latestTime: environment.endsWith(":inventory")
      ? startedAt.toISOString()
      : "2026-08-17T12:04:59.000Z",
    lastStartedAt: startedAt,
    lastCompletedAt: completedAt,
    lastError: null,
    lockedAt: null,
    lockToken: null
  };
}

function input() {
  return {
    environment: "production" as const,
    catalogMaximumAgeSeconds: 86_400,
    inventoryMaximumAgeSeconds: 1_800,
    catalog: {
      available: true,
      environment: "production",
      itemCount: 12,
      variationCount: 18,
      updatedAt: completedAt.toISOString()
    },
    inventory: {
      available: true,
      lastCompletedAt: completedAt.toISOString(),
      latestTime: startedAt.toISOString(),
      totalOperationalLocations: 2,
      mappedOperationalLocations: 2,
      rows: 18
    },
    states: [state("production"), state("production:inventory")],
    now
  };
}

describe("Square PostgreSQL operator status", () => {
  it("passes only complete, fresh, unlocked production catalog and inventory evidence", () => {
    expect(assessSquarePostgresSyncStatus(input())).toEqual({ ok: true, failures: [] });
  });

  it("fails non-ambiguously when inventory evidence is stale", () => {
    const staleCompletedAt = new Date("2026-08-17T11:39:59.999Z");
    const staleStartedAt = new Date("2026-08-17T11:35:00.000Z");
    const stale = input();
    stale.states[1] = {
      ...stale.states[1],
      latestTime: staleStartedAt.toISOString(),
      lastStartedAt: staleStartedAt,
      lastCompletedAt: staleCompletedAt
    };
    stale.inventory.lastCompletedAt = staleCompletedAt.toISOString();
    stale.inventory.latestTime = staleStartedAt.toISOString();

    expect(assessSquarePostgresSyncStatus(stale)).toMatchObject({
      ok: false,
      failures: expect.arrayContaining(["inventory_state_stale"])
    });
  });

  it("rejects incomplete rows, location mappings, locks, and recorded failures", () => {
    const incomplete = input();
    incomplete.inventory.rows = 0;
    incomplete.inventory.mappedOperationalLocations = 1;
    incomplete.states[0] = { ...incomplete.states[0], lastError: "failed" };
    incomplete.states[1] = { ...incomplete.states[1], lockedAt: startedAt, lockToken: "lease" };

    expect(assessSquarePostgresSyncStatus(incomplete)).toEqual({
      ok: false,
      failures: [
        "catalog_state_failed",
        "inventory_rows_missing",
        "inventory_state_locked",
        "operational_locations_incomplete"
      ]
    });
  });

  it("rejects mixed Sandbox state and non-RFC3339 watermarks", () => {
    const invalid = input();
    invalid.states[0] = { ...invalid.states[0], latestTime: "2026-08-17 12:04:59Z" };
    invalid.states.push({ ...state("production"), environment: "sandbox" });

    expect(assessSquarePostgresSyncStatus(invalid)).toMatchObject({
      ok: false,
      failures: expect.arrayContaining(["catalog_watermark_invalid", "unexpected_sync_state_set"])
    });
  });

  it("treats invalid Date objects as failed status instead of throwing", () => {
    const invalid = input();
    invalid.states[0] = { ...invalid.states[0], lastCompletedAt: new Date(Number.NaN) };

    expect(() => assessSquarePostgresSyncStatus(invalid)).not.toThrow();
    expect(assessSquarePostgresSyncStatus(invalid).ok).toBe(false);
  });
});
