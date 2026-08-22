/**
 * Verifies the isolated behavior of admin security.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminCapabilities,
  adminAuthorizationResponse,
  adminSessionCookieName,
  authorizeAdminRequest,
  createAdminSessionToken,
  verifyAdminSessionToken
} from "@/server/admin/admin-security";

const secret = "test-admin-session-secret-that-is-at-least-32-bytes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin security", () => {
  it("fails closed when no administrative session is available", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_SESSION_SECRET", secret);
    const result = await authorizeAdminRequest(new Request("https://shop.example.com/api/admin", {
      headers: { host: "shop.example.com" }
    }), adminCapabilities.read);

    expect(result).toMatchObject({ ok: false, status: 401, code: "ADMIN_SESSION_REQUIRED" });
    if (result.ok) throw new Error("Expected authorization to fail.");
    const response = adminAuthorizationResponse(result);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Authentication required.",
      message: "Authentication required.",
      errors: ["Authentication required."]
    });
  });

  it("accepts an unexpired signed session with the required capability", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_SESSION_SECRET", secret);
    const token = createAdminSessionToken({
      subject: "owner-1",
      capabilities: [adminCapabilities.read],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      secret
    });
    const result = await authorizeAdminRequest(new Request("https://shop.example.com/api/admin", {
      headers: { host: "shop.example.com", cookie: `${adminSessionCookieName}=${token}` }
    }), adminCapabilities.read);

    expect(result).toMatchObject({ ok: true, session: { subject: "owner-1" } });
    expect(verifyAdminSessionToken(`${token}tampered`, secret)).toBeNull();
  });

  it("requires both a mutation capability and the configured same origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_SESSION_SECRET", secret);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.com");
    const token = createAdminSessionToken({
      subject: "editor-1",
      capabilities: [adminCapabilities.write],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      secret
    });
    const headers = { host: "shop.example.com", cookie: `${adminSessionCookieName}=${token}` };

    const missingOrigin = await authorizeAdminRequest(new Request("https://shop.example.com/api/admin", { method: "POST", headers }), adminCapabilities.write);
    expect(missingOrigin).toMatchObject({ ok: false, status: 403, code: "ADMIN_ORIGIN_REJECTED" });

    const foreignOrigin = await authorizeAdminRequest(new Request("https://shop.example.com/api/admin", {
      method: "POST",
      headers: { ...headers, origin: "https://attacker.example" }
    }), adminCapabilities.write);
    expect(foreignOrigin).toMatchObject({ ok: false, status: 403, code: "ADMIN_ORIGIN_REJECTED" });

    const allowed = await authorizeAdminRequest(new Request("https://shop.example.com/api/admin", {
      method: "POST",
      headers: { ...headers, origin: "https://shop.example.com" }
    }), adminCapabilities.write);
    expect(allowed.ok).toBe(true);
  });

  it("keeps the development bypass explicit and loopback-only", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_DEV_BYPASS", "true");
    const local = await authorizeAdminRequest(new Request("http://127.0.0.1:3000/api/admin", {
      headers: { host: "127.0.0.1:3000" }
    }));
    const remote = await authorizeAdminRequest(new Request("https://shop.example.com/api/admin", {
      headers: { host: "shop.example.com" }
    }));

    expect(local.ok).toBe(true);
    expect(remote.ok).toBe(false);
  });
});
