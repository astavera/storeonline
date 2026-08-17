/**
 * Verifies the isolated behavior of Server Component admin sessions.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { adminLoginRedirectPath, resolveAdminSessionRequest } from "@/server/admin/admin-session";
import {
  adminCapabilities,
  adminSessionCookieName,
  createAdminSessionToken
} from "@/server/admin/admin-security";

const secret = "test-admin-server-session-secret-with-more-than-32-bytes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Server Component admin sessions", () => {
  it("accepts an authenticated request with the required capability", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_SESSION_SECRET", secret);
    const token = createAdminSessionToken({
      subject: "owner@example.com",
      capabilities: [adminCapabilities.read],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      secret
    });
    const request = new Request("https://shop.example/admin/homepage", {
      headers: {
        cookie: `${adminSessionCookieName}=${encodeURIComponent(token)}`,
        host: "shop.example"
      }
    });

    await expect(resolveAdminSessionRequest(request, adminCapabilities.read)).resolves.toMatchObject({
      subject: "owner@example.com"
    });
  });

  it("fails closed when the session lacks the required capability", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_SESSION_SECRET", secret);
    const token = createAdminSessionToken({
      subject: "viewer@example.com",
      capabilities: [adminCapabilities.access],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      secret
    });
    const request = new Request("https://shop.example/admin/homepage", {
      headers: {
        cookie: `${adminSessionCookieName}=${encodeURIComponent(token)}`,
        host: "shop.example"
      }
    });

    await expect(resolveAdminSessionRequest(request, adminCapabilities.read)).resolves.toBeNull();
  });

  it("builds a safe login destination without accepting an external return URL", () => {
    expect(adminLoginRedirectPath("/admin/homepage?homepage=draft")).toBe(
      "/admin/login?next=%2Fadmin%2Fhomepage%3Fhomepage%3Ddraft"
    );
    expect(adminLoginRedirectPath("https://attacker.example/admin")).toBe(
      "/admin/login?next=%2Fadmin"
    );
  });
});
