/**
 * Verifies the isolated behavior of admin proxy.
 */

import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";
import { adminSessionCookieName, createAdminSessionToken } from "@/server/admin/admin-security";

const sessionSecret = "admin-proxy-test-secret-with-more-than-32-bytes";

afterEach(() => {
  vi.unstubAllEnvs();
});

const previewEnvironment = {
  STOREFRONT_DESIGN_PREVIEW: "true",
  ADMIN_DEV_BYPASS: "false",
  ALLOW_LOCAL_PERSISTENCE_FALLBACK: "false",
  CUSTOMER_AUTH_DEV_PREVIEW: "false",
  E2E_CATALOG_FIXTURE: "true",
  NEXT_PUBLIC_SITE_INDEXABLE: "false",
  ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "false",
  ORDERPRO_M2M_AUTH_MODE: "DISABLED",
  ORDERPRO_RETURNS_ENABLED: "false",
  ORDERPRO_SHIPPING_CHECKOUT_ENABLED: "false",
  SHIPPO_TEST_MODE: "true",
  SQUARE_ALLOW_PRODUCTION_READONLY_SYNC: "false",
  SQUARE_CHECKOUT_ENABLED: "false",
  SQUARE_ENVIRONMENT: "sandbox",
  SQUARE_RETURNS_REFUNDS_ENABLED: "false"
};

describe("admin route proxy", () => {
  it("redirects an unauthenticated admin request to login and keeps its destination", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", sessionSecret);
    const response = await proxy(new NextRequest("https://shop.example/admin/product-placement?view=products"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("next")).toBe("/admin/product-placement?view=products");
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

describe("design preview proxy", () => {
  it("covers public pages and APIs but skips framework assets", () => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/api/checkout" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/_next/static/chunk.js" })).toBe(false);
  });

  it("blocks checkout before its route handler can run", async () => {
    for (const [key, value] of Object.entries(previewEnvironment)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DIRECT_URL", "");

    const response = await proxy(new NextRequest("https://shop.example/api/checkout", {
      method: "POST"
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "STOREFRONT_DESIGN_PREVIEW_READ_ONLY"
    });
  });

  it("allows only the read-only cart quote POST", async () => {
    for (const [key, value] of Object.entries(previewEnvironment)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DIRECT_URL", "");

    const response = await proxy(new NextRequest("https://shop.example/api/cart", {
      method: "POST"
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed when the preview tuple is unsafe", async () => {
    for (const [key, value] of Object.entries(previewEnvironment)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("SQUARE_CHECKOUT_ENABLED", "true");

    const response = await proxy(new NextRequest("https://shop.example/"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "STOREFRONT_DESIGN_PREVIEW_UNAVAILABLE"
    });
  });
});
