import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "prisma", "migrations", "20260715123000_phase0_operational_hardening", "migration.sql");
const sql = readFileSync(migrationPath, "utf8");

describe("Phase 0 operational hardening migration", () => {
  it("creates every durable operational foundation table", () => {
    for (const table of [
      "CheckoutAttempt",
      "WebhookInboxEvent",
      "SlotOccurrence",
      "CapacityHold",
      "DeliveryZoneVersion",
      "DeliveryRateRule",
      "AddressEvaluation",
      "BalloonOrderDraft",
      "BalloonDraftLine",
      "BalloonQuote"
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("contains idempotency, inbox deduplication, invariant checks, and restrictive operational foreign keys", () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "CheckoutAttempt_idempotencyKey_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "WebhookInboxEvent_provider_eventId_key"');
    expect(sql).toContain('CONSTRAINT "CapacityHold_owner_check"');
    expect(sql).toContain('CONSTRAINT "BalloonQuote_values_check"');
    expect(sql).toContain('CHECK ("quantity" > 0) NOT VALID');
    expect(sql).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
  });
});
