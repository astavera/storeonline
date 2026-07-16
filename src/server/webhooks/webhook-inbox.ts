import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

const webhookEnvelopeSchema = z.object({
  event_id: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(255)
}).passthrough();

export type WebhookInboxRecord = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  status: "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "DEAD_LETTER";
  attempts: number;
  lockToken: string | null;
  duplicate: boolean;
};

export interface WebhookInboxRepository {
  receive(input: { provider: string; eventId: string; eventType: string; payload: unknown }): Promise<WebhookInboxRecord>;
  claimNext(input: { provider: string; now?: Date; leaseMs?: number }): Promise<WebhookInboxRecord | null>;
  markFailure(id: string, lockToken: string, error: unknown, now?: Date): Promise<WebhookInboxRecord>;
  markProcessed(id: string, lockToken: string, now?: Date): Promise<WebhookInboxRecord>;
}

type InMemoryRecord = WebhookInboxRecord & {
  receivedAt: Date;
  lockedAt: Date | null;
  nextAttemptAt: Date | null;
};

export function parseWebhookEnvelope(payload: unknown) {
  return webhookEnvelopeSchema.parse(payload);
}

export function getWebhookInboxRepository(): WebhookInboxRepository {
  const persistence = requireDatabaseOrDevelopmentFallback("Webhook inbox");
  return persistence === "database" ? prismaWebhookInboxRepository : developmentWebhookInboxRepository;
}

export class InMemoryWebhookInboxRepository implements WebhookInboxRepository {
  private readonly records = new Map<string, InMemoryRecord>();

  async receive(input: { provider: string; eventId: string; eventType: string; payload: unknown }) {
    const key = `${input.provider}:${input.eventId}`;
    const existing = this.records.get(key);
    if (existing) return publicRecord(existing, true);
    const created: InMemoryRecord = {
      id: `development-${this.records.size + 1}`,
      provider: input.provider,
      eventId: input.eventId,
      eventType: input.eventType,
      payload: input.payload,
      status: "RECEIVED",
      attempts: 0,
      receivedAt: new Date(),
      lockedAt: null,
      lockToken: null,
      nextAttemptAt: null,
      duplicate: false
    };
    this.records.set(key, created);
    return publicRecord(created, false);
  }

  async claimNext(input: { provider: string; now?: Date; leaseMs?: number }) {
    const now = input.now ?? new Date();
    const staleBefore = now.getTime() - normalizeLeaseMs(input.leaseMs);
    const candidate = Array.from(this.records.values())
      .filter((record) => record.provider === input.provider && isClaimable(record, now, staleBefore))
      .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime())[0];
    if (!candidate) return null;

    candidate.status = "PROCESSING";
    candidate.attempts += 1;
    candidate.lockedAt = now;
    candidate.lockToken = randomUUID();
    candidate.nextAttemptAt = null;
    return publicRecord(candidate, false);
  }

  async markFailure(id: string, lockToken: string, error: unknown, now = new Date()) {
    const record = this.findById(id);
    assertLease(record, lockToken);
    record.status = record.attempts >= 5 ? "DEAD_LETTER" : "FAILED";
    record.nextAttemptAt = record.status === "FAILED" ? new Date(now.getTime() + retryDelayMs(record.attempts)) : null;
    record.lockedAt = null;
    record.lockToken = null;
    void sanitizeProcessingError(error);
    return publicRecord(record, false);
  }

  async markProcessed(id: string, lockToken: string) {
    const record = this.findById(id);
    assertLease(record, lockToken);
    record.status = "PROCESSED";
    record.nextAttemptAt = null;
    record.lockedAt = null;
    record.lockToken = null;
    return publicRecord(record, false);
  }

  private findById(id: string) {
    const record = Array.from(this.records.values()).find((candidate) => candidate.id === id);
    if (!record) throw new Error("Webhook inbox record does not exist.");
    return record;
  }
}

const developmentWebhookInboxRepository = new InMemoryWebhookInboxRepository();

const prismaWebhookInboxRepository: WebhookInboxRepository = {
  async receive(input) {
    const prisma = getPrismaClient();
    try {
      try {
        const created = await prisma.webhookInboxEvent.create({
          data: {
            provider: input.provider,
            eventId: input.eventId,
            eventType: input.eventType,
            payload: toPrismaJson(input.payload)
          }
        });
        return toRecord(created, false);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const existing = await prisma.webhookInboxEvent.findUnique({
          where: { provider_eventId: { provider: input.provider, eventId: input.eventId } }
        });
        if (!existing) throw error;
        return toRecord(existing, true);
      }
    } catch (error) {
      throw new PersistenceUnavailableError("Webhook inbox", { cause: error });
    }
  },

  async claimNext(input) {
    const now = input.now ?? new Date();
    const staleBefore = new Date(now.getTime() - normalizeLeaseMs(input.leaseMs));
    try {
      for (let collision = 0; collision < 3; collision += 1) {
        const claimed = await getPrismaClient().$transaction(async (transaction) => {
          const candidate = await transaction.webhookInboxEvent.findFirst({
            where: {
              provider: input.provider,
              OR: [
                { status: "RECEIVED" },
                { status: "FAILED", nextAttemptAt: { lte: now } },
                { status: "PROCESSING", lockedAt: { lte: staleBefore } }
              ]
            },
            orderBy: { receivedAt: "asc" }
          });
          if (!candidate) return null;

          const lockToken = randomUUID();
          const update = await transaction.webhookInboxEvent.updateMany({
            where: { id: candidate.id, status: candidate.status, updatedAt: candidate.updatedAt },
            data: {
              status: "PROCESSING",
              attempts: { increment: 1 },
              lastAttemptAt: now,
              nextAttemptAt: null,
              lockedAt: now,
              lockToken,
              error: null
            }
          });
          if (update.count !== 1) return undefined;
          return transaction.webhookInboxEvent.findUniqueOrThrow({ where: { id: candidate.id } });
        }, { isolationLevel: "Serializable" });

        if (claimed === null) return null;
        if (claimed) return toRecord(claimed, false);
      }
      return null;
    } catch (error) {
      throw new PersistenceUnavailableError("Webhook inbox", { cause: error });
    }
  },

  async markFailure(id, lockToken, error, now = new Date()) {
    try {
      const updated = await getPrismaClient().$transaction(async (transaction) => {
        const current = await transaction.webhookInboxEvent.findUniqueOrThrow({ where: { id } });
        if (current.status !== "PROCESSING" || current.lockToken !== lockToken) throw new Error("Webhook processing lease was lost.");
        const status = current.attempts >= 5 ? "DEAD_LETTER" as const : "FAILED" as const;
        return transaction.webhookInboxEvent.update({
          where: { id },
          data: {
            status,
            nextAttemptAt: status === "FAILED" ? new Date(now.getTime() + retryDelayMs(current.attempts)) : null,
            lockedAt: null,
            lockToken: null,
            error: sanitizeProcessingError(error)
          }
        });
      }, { isolationLevel: "Serializable" });
      return toRecord(updated, false);
    } catch (failure) {
      throw new PersistenceUnavailableError("Webhook inbox", { cause: failure });
    }
  },

  async markProcessed(id, lockToken, now = new Date()) {
    try {
      const update = await getPrismaClient().webhookInboxEvent.updateMany({
        where: { id, status: "PROCESSING", lockToken },
        data: {
          status: "PROCESSED",
          processedAt: now,
          nextAttemptAt: null,
          lockedAt: null,
          lockToken: null,
          error: null
        }
      });
      if (update.count !== 1) throw new Error("Webhook processing lease was lost.");
      return toRecord(await getPrismaClient().webhookInboxEvent.findUniqueOrThrow({ where: { id } }), false);
    } catch (error) {
      throw new PersistenceUnavailableError("Webhook inbox", { cause: error });
    }
  }
};

function toRecord(record: {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  status: WebhookInboxRecord["status"];
  attempts: number;
  lockToken: string | null;
}, duplicate: boolean): WebhookInboxRecord {
  return { ...record, duplicate };
}

function publicRecord(record: InMemoryRecord, duplicate: boolean): WebhookInboxRecord {
  return {
    id: record.id,
    provider: record.provider,
    eventId: record.eventId,
    eventType: record.eventType,
    payload: record.payload,
    status: record.status,
    attempts: record.attempts,
    lockToken: record.lockToken,
    duplicate
  };
}

function isClaimable(record: InMemoryRecord, now: Date, staleBefore: number) {
  if (record.status === "RECEIVED") return true;
  if (record.status === "FAILED") return Boolean(record.nextAttemptAt && record.nextAttemptAt <= now);
  return record.status === "PROCESSING" && Boolean(record.lockedAt && record.lockedAt.getTime() <= staleBefore);
}

function assertLease(record: InMemoryRecord, lockToken: string) {
  if (record.status !== "PROCESSING" || record.lockToken !== lockToken) throw new Error("Webhook processing lease was lost.");
}

function normalizeLeaseMs(value: number | undefined) {
  return Number.isSafeInteger(value) && (value as number) >= 1_000 ? value as number : 5 * 60_000;
}

function retryDelayMs(attempts: number) {
  return Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
}

function sanitizeProcessingError(error: unknown) {
  const message = error instanceof Error ? error.message : "Webhook processing failed.";
  return message.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s@]+@/gi, "[redacted-url]").slice(0, 500);
}
