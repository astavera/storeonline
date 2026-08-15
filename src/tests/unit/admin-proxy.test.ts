/**
 * Verifies the isolated behavior of admin proxy.
 */

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";
import { adminSessionCookieName, createAdminSessionToken } from "@/server/admin/admin-security";

const sessionSecret = "admin-proxy-test-secret-with-more-than-32-bytes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin route proxy", () => {
  it("redirects an unauthenticated admin request to login and keeps its destination", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", sessionSecret);
    const response = await proxy(new NextRequest("https://shop.example/admin/product-placement?view=products"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("returnTo")).toBe("/admin/product-placement?view=products");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps the login page public", async () => {
    const response = await proxy(new NextRequest("https://shop.example/admin/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows an authenticated admin session", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", sessionSecret);
    const token = createAdminSessionToken({
      subject: "owner@example.com",
      capabilities: ["admin:*"],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      secret: sessionSecret
    });
    const response = await proxy(new NextRequest("https://shop.example/admin", {
      headers: { cookie: `${adminSessionCookieName}=${token}` }
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
