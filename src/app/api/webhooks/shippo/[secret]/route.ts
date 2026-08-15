/**
 * Receives Shippo events at a rotatable secret path, then durably records them
 * before acknowledging. Configure Shippo with /api/webhooks/shippo/{secret}.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/validation/env";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { getWebhookInboxRepository } from "@/server/webhooks/webhook-inbox";
import { parseShippoWebhook } from "@/server/webhooks/shippo-webhook-handler";

const maxWebhookBytes = 512 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ secret: string }> }
) {
  const { secret } = await context.params;
  if (!safeSecretEqual(secret, env.SHIPPO_WEBHOOK_SECRET)) {
    return NextResponse.json({ received: false }, { status: 404 });
  }
  const announcedLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(announcedLength) && announcedLength > maxWebhookBytes) {
    return NextResponse.json({ received: false }, { status: 413 });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxWebhookBytes) {
    return NextResponse.json({ received: false }, { status: 413 });
  }
  try {
    const payload = JSON.parse(body) as unknown;
    const envelope = parseShippoWebhook(payload);
    const record = await getWebhookInboxRepository().receive({
      provider: "shippo",
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      payload
    });
    return NextResponse.json(
      { received: true, duplicate: record.duplicate },
      { status: 202, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ received: false }, { status: 503 });
    }
    return NextResponse.json({ received: false }, { status: 400 });
  }
}

function safeSecretEqual(received: string, expected: string | undefined) {
  if (!expected || expected.length < 32) return false;
  return timingSafeEqual(
    createHash("sha256").update(received).digest(),
    createHash("sha256").update(expected).digest()
  );
}
