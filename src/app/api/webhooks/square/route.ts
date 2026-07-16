import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { env } from "@/lib/validation/env";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { verifySquareWebhookSignature } from "@/server/square/webhook-signature";
import { getWebhookInboxRepository, parseWebhookEnvelope } from "@/server/webhooks/webhook-inbox";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");
  const notificationUrl = `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/square`;
  const valid = verifySquareWebhookSignature({
    body,
    signature,
    signatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    notificationUrl
  });

  if (!valid) {
    return NextResponse.json({ received: false, error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body) as unknown;
    const envelope = parseWebhookEnvelope(payload);
    const record = await getWebhookInboxRepository().receive({
      provider: "square",
      eventId: envelope.event_id,
      eventType: envelope.type,
      payload
    });

    return NextResponse.json({ received: true, duplicate: record.duplicate, inboxId: record.id }, { status: 202 });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ received: false, error: error.message }, { status: 503 });
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json({ received: false, error: "Invalid webhook event." }, { status: 400 });
    }
    return NextResponse.json({ received: false, error: "Webhook intake failed." }, { status: 500 });
  }
}
