/**
 * Verifies the isolated behavior of admin login route.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  isConfigured: vi.fn(),
  verifyCredentials: vi.fn()
}));

vi.mock("@/server/admin/admin-rate-limit", () => ({
  getAdminRateLimiter: () => ({ consume: mocks.consume })
}));

vi.mock("@/server/admin/admin-login", () => ({
  isAdminLoginConfigured: mocks.isConfigured,
  verifyAdminCredentials: mocks.verifyCredentials
}));

vi.mock("@/server/admin/admin-security", () => ({
  adminSessionCookieName: "modern_state_admin",
  createAdminSessionToken: () => "signed-test-token",
  isTrustedMutationOrigin: () => true
}));

import { POST } from "@/app/api/admin/auth/login/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("admin login route", () => {
  it("does not consume the failed-attempt limit when credentials are correct", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-admin-session-secret-that-is-at-least-32-bytes");
    mocks.isConfigured.mockReturnValue(true);
    mocks.verifyCredentials.mockReturnValue(true);

    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, returnTo: "/admin/homepage" });
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("returns the lockout only after a failed credential check", async () => {
    mocks.isConfigured.mockReturnValue(true);
    mocks.verifyCredentials.mockReturnValue(false);
    mocks.consume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 120 });

    const response = await POST(loginRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: expect.stringContaining("failed login attempts") });
    expect(mocks.consume).toHaveBeenCalledOnce();
  });

  it("keeps the private preview authentication active after incorrect admin credentials", async () => {
    mocks.isConfigured.mockReturnValue(true);
    mocks.verifyCredentials.mockReturnValue(false);
    mocks.consume.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 120 });

    const response = await POST(loginRequest());

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Email or password is incorrect." });
  });
});

function loginRequest() {
  return new Request("http://127.0.0.1:3001/api/admin/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" },
    body: JSON.stringify({ email: "owner@example.com", password: "correct-password", returnTo: "/admin/homepage" })
  });
}
