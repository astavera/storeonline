/**
 * Verifies the isolated behavior of webhook inbox.
 */

import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { InMemoryWebhookInboxRepository, parseWebhookEnvelope } from "@/server/webhooks/webhook-inbox";

describe("webhook inbox", () => {
  it("deduplicates provider event ids without dropping the original", async () => {
    const repository = new InMemoryWebhookInboxRepository();
    const first = await repository.receive({ provider: "square", eventId: "evt-1", eventType: "catalog.version.updated", payload: { event_id: "evt-1" } });
    const duplicate = await repository.receive({ provider: "square", eventId: "evt-1", eventType: "catalog.version.updated", payload: { event_id: "evt-1" } });

    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({ id: first.id, duplicate: true, status: "RECEIVED" });
  });

  it("tracks bounded processing retries and dead-letters the fifth failure", async () => {
    const repository = new InMemoryWebhookInboxRepository();
    await repository.receive({ provider: "square", eventId: "evt-retry", eventType: "inventory.count.updated", payload: {} });
    let now = new Date("2026-07-15T12:00:00.000Z");
    let current;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const claimed = await repository.claimNext({ provider: "square", now });
      expect(claimed?.lockToken).toBeTruthy();
      current = await repository.markFailure(claimed!.id, claimed!.lockToken!, new Error("processing failed"), now);
      now = new Date(now.getTime() + 16 * 60_000);
    }

    expect(current).toMatchObject({ attempts: 5, status: "DEAD_LETTER" });
  });

  it("uses leases to prevent two workers from claiming the same event", async () => {
    const repository = new InMemoryWebhookInboxRepository();
    await repository.receive({ provider: "square", eventId: "evt-lease", eventType: "catalog.version.updated", payload: {} });

    const first = await repository.claimNext({ provider: "square", now: new Date("2026-07-15T12:00:00.000Z") });
    const second = await repository.claimNext({ provider: "square", now: new Date("2026-07-15T12:00:01.000Z") });

    expect(first).toMatchObject({ status: "PROCESSING", attempts: 1 });
    expect(second).toBeNull();
    await expect(repository.markProcessed(first!.id, "wrong-token")).rejects.toThrow("lease was lost");
    await expect(repository.markProcessed(first!.id, first!.lockToken!)).resolves.toMatchObject({ status: "PROCESSED" });
  });

  it("rejects malformed event envelopes before persistence", () => {
    expect(() => parseWebhookEnvelope({ type: "inventory.count.updated" })).toThrow(ZodError);
    expect(parseWebhookEnvelope({ event_id: "evt-valid", type: "inventory.count.updated", data: {} }))
      .toMatchObject({ event_id: "evt-valid", type: "inventory.count.updated" });
  });
});
