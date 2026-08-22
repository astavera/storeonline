/** Verifies non-enumerating, rate-limited Admin password recovery requests. */

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  requestReset: vi.fn()
}));

vi.mock("@/server/admin/admin-rate-limit", () => ({ getAdminRateLimiter: () => ({ consume: mocks.consume }) }));
vi.mock("@/server/admin/admin-security", () => ({ isTrustedMutationOrigin: () => true }));
vi.mock("@/server/admin/identity/admin-password-reset-service", () => ({
  AdminPasswordResetUnavailableError: class extends Error {},
  requestAdminPasswordReset: mocks.requestReset
}));

import { POST } from "@/app/api/admin/auth/forgot-password/route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("Admin forgot password route", () => {
  it("returns the same accepted response after a valid request", async () => {
    mocks.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
    mocks.requestReset.mockResolvedValue({ accepted: true });
    const response = await POST(request({ email: " Owner@Example.com " }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      message: "If an active Admin account uses that email, a reset link has been sent."
    });
    expect(mocks.requestReset).toHaveBeenCalledWith("owner@example.com");
  });

  it("rate limits before issuing another email", async () => {
    mocks.consume
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 120 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 60 });
    const response = await POST(request({ email: "owner@example.com" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(mocks.requestReset).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new Request("https://admin.example.com/api/admin/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json", host: "admin.example.com", origin: "https://admin.example.com" },
    body: JSON.stringify(body)
  });
}
