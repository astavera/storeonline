/**
 * Verifies the isolated behavior of operational runtime migration.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsRoot = path.join(process.cwd(), "prisma", "migrations");
const runtimeSql = readFileSync(path.join(migrationsRoot, "20260715173000_phase1_operational_runtime", "migration.sql"), "utf8");
const validationSql = readFileSync(path.join(migrationsRoot, "20260715180000_validate_operational_constraints", "migration.sql"), "utf8");

describe("Phase 1 operational runtime migrations", () => {
  it("adds durable worker leases, rate limits, Square sync state, and submitted balloon requests", () => {
    expect(runtimeSql).toContain('ADD COLUMN "lockToken" TEXT');
    expect(runtimeSql).toContain('CREATE TABLE "AdminRateLimitBucket"');
    expect(runtimeSql).toContain('CREATE TABLE "SquareCatalogSyncState"');
    expect(runtimeSql).toContain("ALTER TYPE \"BalloonDraftStatus\" ADD VALUE IF NOT EXISTS 'SUBMITTED'");
    expect(runtimeSql).toContain('ADD COLUMN "submittedAt" TIMESTAMP(3)');
    expect(runtimeSql).toContain('ADD COLUMN "requestDetails" JSONB');
    expect(runtimeSql).toContain('ADD COLUMN "deletedAt" TIMESTAMP(3)');
  });

  it("introduces webhook invariants as not-valid before the later validation migration", () => {
    expect(runtimeSql).toContain("Recovered during durable lease migration.");
    expect(runtimeSql).toContain("WHERE \"status\" = 'PROCESSING'");
    expect(runtimeSql).toContain("WHERE \"status\" = 'FAILED' AND \"nextAttemptAt\" IS NULL");
    expect(runtimeSql).toContain('CONSTRAINT "WebhookInboxEvent_processing_lease_check"');
    expect(runtimeSql).toContain('CONSTRAINT "WebhookInboxEvent_retry_schedule_check"');
    expect(runtimeSql.match(/NOT VALID/g)).toHaveLength(2);
    expect(validationSql).toContain('VALIDATE CONSTRAINT "WebhookInboxEvent_processing_lease_check"');
    expect(validationSql).toContain('VALIDATE CONSTRAINT "WebhookInboxEvent_retry_schedule_check"');
  });

  it("validates every constraint atomically with bounded database locks", () => {
    expect(validationSql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(validationSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(validationSql).toContain("SET LOCAL statement_timeout = '120s';");
    expect(validationSql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
});
