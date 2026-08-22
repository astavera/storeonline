/** Verifies single-use Admin password reset completion boundaries. */

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeReset: vi.fn(),
  consume: vi.fn()
}));

vi.mock("@/server/admin/admin-rate-limit", () => ({ getAdminRateLimiter: () => ({ consume: mocks.consume }) }));
vi.mock("@/server/admin/admin-security", () => ({ isTrustedMutationOrigin: () => true }));
vi.mock("@/server/admin/identity/admin-password-reset-service", () => {
  class AdminPasswordResetInvalidError extends Error {
    constructor() {
      super("This password reset link is invalid or expired.");
    }
  }
  return { AdminPasswordResetInvalidError, completeAdminPasswordReset: mocks.completeReset };
});

import { AdminPasswordResetInvalidError } from "@/server/admin/identity/admin-password-reset-service";
import { POST } from "@/app/api/admin/auth/reset-password/route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("Admin reset password route", () => {
  it("completes a valid reset after rate limiting", async () => {
    mocks.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
    mocks.completeReset.mockResolvedValue({ ok: true });
    const response = await POST(request({ token: "t".repeat(43), password: "a-secure-new-password" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.completeReset).toHaveBeenCalledWith({ token: "t".repeat(43), password: "a-secure-new-password" });
  });

  it("returns a generic expired result for an invalid or consumed token", async () => {
    mocks.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
    mocks.completeReset.mockRejectedValue(new AdminPasswordResetInvalidError());
    const response = await POST(request({ token: "t".repeat(43), password: "a-secure-new-password" }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "This password reset link is invalid or expired." });
  });
});

function request(body: unknown) {
  return new Request("https://admin.example.com/api/admin/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", host: "admin.example.com", origin: "https://admin.example.com" },
    body: JSON.stringify(body)
  });
}
