import { describe, expect, it, vi } from "vitest";
import { InMemoryWebhookInboxRepository } from "@/server/webhooks/webhook-inbox";
import { processWebhookBatch } from "@/server/webhooks/webhook-processor";

describe("webhook batch processor", () => {
  it("processes each claimed event once", async () => {
    const repository = new InMemoryWebhookInboxRepository();
    await repository.receive({ provider: "square", eventId: "evt-1", eventType: "inventory.count.updated", payload: {} });
    await repository.receive({ provider: "square", eventId: "evt-2", eventType: "catalog.version.updated", payload: {} });
    const handler = vi.fn().mockResolvedValue(undefined);

    const result = await processWebhookBatch({ repository, handler, provider: "square", limit: 10 });

    expect(result).toEqual({ claimed: 2, processed: 2, failed: 0, deadLettered: 0 });
    expect(handler).toHaveBeenCalledTimes(2);
    await expect(processWebhookBatch({ repository, handler, provider: "square" }))
      .resolves.toEqual({ claimed: 0, processed: 0, failed: 0, deadLettered: 0 });
  });

  it("records handler failures for a later retry", async () => {
    const repository = new InMemoryWebhookInboxRepository();
    await repository.receive({ provider: "square", eventId: "evt-fail", eventType: "unsupported", payload: {} });

    await expect(processWebhookBatch({
      repository,
      handler: async () => { throw new Error("unsupported"); },
      provider: "square",
      limit: 1
    })).resolves.toEqual({ claimed: 1, processed: 0, failed: 1, deadLettered: 0 });
  });
});
