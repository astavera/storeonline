/**
 * Implements server-side webhook signature behavior and persistence boundaries.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

export function verifySquareWebhookSignature({
  body,
  signature,
  signatureKey,
  notificationUrl
}: {
  body: string;
  signature: string | null;
  signatureKey: string | undefined;
  notificationUrl: string;
}) {
  if (!signature || !signatureKey) {
    return false;
  }

  const payload = notificationUrl + body;
  const digest = createHmac("sha256", signatureKey).update(payload).digest("base64");
  const signatureBuffer = Buffer.from(signature, "base64");
  const digestBuffer = Buffer.from(digest, "base64");

  if (signatureBuffer.length !== digestBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, digestBuffer);
}
