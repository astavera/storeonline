import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { getWebhookInboxRepository } from "@/server/webhooks/webhook-inbox";
import { processWebhookBatch } from "@/server/webhooks/webhook-processor";
import { authorizeWebhookWorker } from "@/server/webhooks/webhook-worker-auth";
import { handleSquareWebhookEvent } from "@/server/webhooks/square-webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeWebhookWorker(request)) {
    return NextResponse.json({ ok: false, error: "WORKER_UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 10);
    const result = await processWebhookBatch({
      repository: getWebhookInboxRepository(),
      handler: handleSquareWebhookEvent,
      provider: "square",
      limit: requestedLimit,
      onError(error, record) {
        Sentry.captureException(error, {
          tags: { subsystem: "square-webhook-worker", eventType: record.eventType },
          extra: { inboxId: record.id, eventId: record.eventId, attempt: record.attempts }
        });
      }
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    Sentry.captureException(error, { tags: { subsystem: "square-webhook-worker" } });
    const status = error instanceof PersistenceUnavailableError ? 503 : 500;
    return NextResponse.json({ ok: false, error: "WORKER_FAILED" }, { status });
  }
}
