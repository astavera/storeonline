/**
 * Verifies that order lookup responses do not disclose whether an order exists.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startVerification: vi.fn(),
  consume: vi.fn(async () => ({ allowed: true, remaining: 4, retryAfterSeconds: 1 }))
}));

vi.mock("@/server/admin/admin-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/admin-rate-limit")>();
  return { ...actual, getAdminRateLimiter: () => ({ consume: mocks.consume }) };
});

vi.mock("@/server/returns/return-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/returns/return-service")>();
  return {
    ...actual,
    createReturnsService: () => ({ startVerification: mocks.startVerification })
  };
});

describe("return verification route", () => {
  beforeEach(() => {
    vi.stubEnv("RETURNS_SESSION_SECRET", "test-return-session-secret-that-is-at-least-32-bytes");
    mocks.startVerification.mockReset();
    mocks.consume.mockClear();
  });

  it("returns the same generic response for an existing and an unknown order", async () => {
    mocks.startVerification
      .mockResolvedValueOnce({
        verificationHandle: "signed-known-challenge",
        expiresAt: "2026-07-30T16:10:00.000Z"
      })
      .mockRejectedValueOnce(Object.assign(new Error("not found"), {
        name: "OrderProReturnsError",
        code: "ORDERPRO_RETURNS_HTTP_404"
      }));
    const { POST } = await import("@/app/api/returns/verification/start/route");

    const known = await POST(requestFor("MS-1001"));
    const unknown = await POST(requestFor("MS-9999"));
    const knownBody = await known.json() as Record<string, unknown>;
    const unknownBody = await unknown.json() as Record<string, unknown>;

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(knownBody.message).toBe(unknownBody.message);
    expect(knownBody.accepted).toBe(true);
    expect(unknownBody.accepted).toBe(true);
    expect(typeof knownBody.verificationHandle).toBe("string");
    expect(typeof unknownBody.verificationHandle).toBe("string");
    expect(knownBody).not.toHaveProperty("order");
    expect(unknownBody).not.toHaveProperty("order");
  });
});

function requestFor(orderNumber: string) {
  return new NextRequest("http://localhost:3000/api/returns/verification/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000"
    },
    body: JSON.stringify({
      orderNumber,
      email: "customer@example.com",
      postalCode: "10028"
    })
  });
}
