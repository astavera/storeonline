/** Read and safely requeue persisted webhook inbox events. */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";
import { recordAdminAuditEvent } from "@/server/admin/admin-audit-service";

const webhookInboxStatuses = new Set(["RECEIVED", "PROCESSING", "PROCESSED", "FAILED", "DEAD_LETTER"]);

export async function readAdminWebhookEvents(input: { provider?: string; status?: string; page?: number }) {
  const pageSize = 25;
  const requestedPage = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
  if (!process.env.DATABASE_URL) return { available: false, events: [], total: 0, page: requestedPage, pageCount: 1, providers: [] as string[] };
  try {
    const prisma = getPrismaClient();
    const requestedStatus = input.status?.trim().toUpperCase();
    const status = requestedStatus && webhookInboxStatuses.has(requestedStatus) ? requestedStatus : undefined;
    const where = {
      ...(input.provider ? { provider: input.provider.slice(0, 80) } : {}),
      ...(status ? { status: status as never } : {})
    };
    const [total, providers] = await Promise.all([
      prisma.webhookInboxEvent.count({ where }),
      prisma.webhookInboxEvent.findMany({ distinct: ["provider"], select: { provider: true }, orderBy: { provider: "asc" } })
    ]);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const events = await prisma.webhookInboxEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, provider: true, eventId: true, eventType: true, status: true, attempts: true, receivedAt: true, lastAttemptAt: true, nextAttemptAt: true, processedAt: true, error: true }
    });
    return {
      available: true,
      total,
      page,
      pageCount,
      providers: providers.map(({ provider }) => provider),
      events: events.map((event) => ({ ...event, receivedAt: event.receivedAt.toISOString(), lastAttemptAt: event.lastAttemptAt?.toISOString() ?? null, nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null, processedAt: event.processedAt?.toISOString() ?? null, error: sanitizeError(event.error) }))
    };
  } catch (error) {
    console.warn("[admin-webhooks] Could not read webhook events.", error);
    return { available: false, events: [], total: 0, page: requestedPage, pageCount: 1, providers: [] as string[] };
  }
}

export async function requeueAdminWebhookEvent(input: { id: string; actorSubject: string }) {
  if (!process.env.DATABASE_URL) return false;
  const result = await getPrismaClient().webhookInboxEvent.updateMany({
    where: { id: input.id, status: { in: ["FAILED", "DEAD_LETTER"] } },
    data: { status: "FAILED", nextAttemptAt: new Date(), lockedAt: null, lockToken: null, error: null }
  });
  if (result.count !== 1) return false;
  await recordAdminAuditEvent({ actorId: input.actorSubject, action: "WEBHOOK_EVENT_REQUEUED", entityType: "WebhookInboxEvent", entityId: input.id, after: { status: "FAILED", nextAttemptAt: "immediate" } });
  return true;
}

function sanitizeError(value: string | null) {
  return value?.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s@]+@/gi, "[redacted-url]").slice(0, 300) ?? null;
}
