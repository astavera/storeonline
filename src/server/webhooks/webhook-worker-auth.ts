/**
 * Implements server-side webhook worker auth behavior and persistence boundaries.
 */

import "server-only";

import { timingSafeEqual } from "node:crypto";

export function authorizeWebhookWorker(request: Request) {
  const configured = process.env.WEBHOOK_WORKER_SECRET;
  if (!configured || Buffer.byteLength(configured, "utf8") < 32) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const received = header.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(configured, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
