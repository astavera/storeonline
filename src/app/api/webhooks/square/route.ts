import { NextResponse } from "next/server";
import { env } from "@/lib/validation/env";
import { verifySquareWebhookSignature } from "@/server/square/webhook-signature";

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
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  return NextResponse.json({ received: true });
}
