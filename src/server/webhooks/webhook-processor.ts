import "server-only";

import type { WebhookInboxRecord, WebhookInboxRepository } from "@/server/webhooks/webhook-inbox";

export type WebhookEventHandler = (record: WebhookInboxRecord) => Promise<void>;

export type WebhookBatchResult = {
  claimed: number;
  processed: number;
  failed: number;
  deadLettered: number;
};

export async function processWebhookBatch(input: {
  repository: WebhookInboxRepository;
  handler: WebhookEventHandler;
  provider: string;
  limit?: number;
  onError?: (error: unknown, record: WebhookInboxRecord) => void;
}): Promise<WebhookBatchResult> {
  const limit = normalizeLimit(input.limit);
  const result: WebhookBatchResult = { claimed: 0, processed: 0, failed: 0, deadLettered: 0 };

  for (let index = 0; index < limit; index += 1) {
    const record = await input.repository.claimNext({ provider: input.provider });
    if (!record) break;
    if (!record.lockToken) throw new Error("Claimed webhook is missing its processing lease.");
    result.claimed += 1;

    try {
      await input.handler(record);
      await input.repository.markProcessed(record.id, record.lockToken);
      result.processed += 1;
    } catch (error) {
      input.onError?.(error, record);
      const failed = await input.repository.markFailure(record.id, record.lockToken, error);
      if (failed.status === "DEAD_LETTER") result.deadLettered += 1;
      else result.failed += 1;
    }
  }

  return result;
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isSafeInteger(value)) return 10;
  return Math.min(100, Math.max(1, value as number));
}
