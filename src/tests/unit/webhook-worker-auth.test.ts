/**
 * Verifies the isolated behavior of webhook worker auth.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeWebhookWorker } from "@/server/webhooks/webhook-worker-auth";

afterEach(() => vi.unstubAllEnvs());

describe("webhook worker authentication", () => {
  it("fails closed without a strong configured secret", () => {
    vi.stubEnv("WEBHOOK_WORKER_SECRET", "");
    expect(authorizeWebhookWorker(new Request("https://shop.example/api/internal/webhooks/process"))).toBe(false);
  });

  it("compares the bearer secret exactly", () => {
    const secret = "worker-secret-that-is-at-least-32-bytes";
    vi.stubEnv("WEBHOOK_WORKER_SECRET", secret);
    expect(authorizeWebhookWorker(new Request("https://shop.example/api/internal/webhooks/process", {
      headers: { authorization: `Bearer ${secret}` }
    }))).toBe(true);
    expect(authorizeWebhookWorker(new Request("https://shop.example/api/internal/webhooks/process", {
      headers: { authorization: "Bearer wrong" }
    }))).toBe(false);
  });
});
