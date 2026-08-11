/**
 * Verifies the isolated behavior of admin rate limit.
 */

import { describe, expect, it } from "vitest";
import { InMemoryAdminRateLimiter, PersistentAdminRateLimiter, type AdminRateLimitStore } from "@/server/admin/admin-rate-limit";

describe("administrative rate limiting", () => {
  it("enforces a fixed window and resets deterministically", async () => {
    const limiter = new InMemoryAdminRateLimiter();
    const input = { key: "admin-1", scope: "upload", limit: 2, windowMs: 1_000 };

    await expect(limiter.consume({ ...input, now: 100 })).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(limiter.consume({ ...input, now: 200 })).resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(limiter.consume({ ...input, now: 300 })).resolves.toMatchObject({ allowed: false, remaining: 0 });
    await expect(limiter.consume({ ...input, now: 1_001 })).resolves.toMatchObject({ allowed: true, remaining: 1 });
  });

  it("hashes the subject before sending a shared bucket to storage", async () => {
    let captured: Parameters<AdminRateLimitStore["increment"]>[0] | undefined;
    const limiter = new PersistentAdminRateLimiter({
      async increment(input) {
        captured = input;
        return 1;
      }
    });

    await limiter.consume({ key: "owner@example.com", scope: "admin", limit: 5, windowMs: 60_000, now: 65_000 });

    expect(captured?.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(captured?.keyHash).not.toContain("owner@example.com");
    expect(captured?.windowStartedAt.toISOString()).toBe("1970-01-01T00:01:00.000Z");
  });
});
