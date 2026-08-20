/**
 * Verifies the isolated behavior of admin proxy.
 */

import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";
import { hashAdminPassword } from "@/server/admin/admin-login";
import { adminSessionCookieName, createAdminSessionToken } from "@/server/admin/admin-security";

const sessionSecret = "admin-proxy-test-secret-with-more-than-32-bytes";
const validPasswordHash = hashAdminPassword("correct-admin-preview-password", Buffer.alloc(16, 9));

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

const adminPreviewEnvironment = {
  STOREFRONT_ADMIN_PREVIEW: "true",
  STOREFRONT_DESIGN_PREVIEW: "false",
  ADMIN_ALLOWED_ORIGINS: "https://shop.example",
  ADMIN_DEV_BYPASS: "false",
  ADMIN_LOGIN_EMAIL: "owner@example.com",
  ADMIN_PASSWORD_HASH: validPasswordHash,
  ADMIN_SESSION_SECRET: sessionSecret,
  ALLOW_LOCAL_PERSISTENCE_FALLBACK: "false",
  CUSTOMER_AUTH_DEV_PREVIEW: "false",
  DATABASE_URL: "postgresql://runtime:secret@database.example/storefront",
  DIRECT_URL: "postgresql://migrator:secret@database.example/storefront",
  E2E_CATALOG_FIXTURE: "false",
  NEXT_PUBLIC_SITE_INDEXABLE: "false",
  ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "false",
  ORDERPRO_M2M_AUTH_MODE: "DISABLED",
  ORDERPRO_RETURNS_ENABLED: "false",
  ORDERPRO_SHIPPING_CHECKOUT_ENABLED: "false",
  SHIPPO_TEST_MODE: "true",
  SQUARE_ALLOW_PRODUCTION_READONLY_SYNC: "false",
  SQUARE_CHECKOUT_ENABLED: "false",
  SQUARE_ENVIRONMENT: "production",
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

describe("storefront maintenance proxy", () => {
  it("rewrites customer pages to the static maintenance page", async () => {
    vi.stubEnv("STOREFRONT_MAINTENANCE_MODE", "true");

    const response = await proxy(new NextRequest("https://shop.example/products/teddy-bear?ref=home"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://shop.example/maintenance.html"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });

  it("keeps admin pages and APIs available during maintenance", async () => {
    vi.stubEnv("STOREFRONT_MAINTENANCE_MODE", "true");

    for (const pathname of ["/admin/login", "/api/health"]) {
      const response = await proxy(new NextRequest(`https://shop.example${pathname}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
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

describe("admin preview proxy", () => {
  it("allows an authenticated catalog page and the exact read API only", async () => {
    stubAdminPreviewEnvironment();
    const token = createAdminSessionToken({
      subject: "owner@example.com",
      capabilities: ["admin:*"],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      secret: sessionSecret
    });
    const headers = { cookie: `${adminSessionCookieName}=${token}` };

    for (const pathname of ["/admin/catalog", "/api/admin/full-catalog-products?q=balloon&page=2"]) {
      const response = await proxy(new NextRequest(`https://shop.example${pathname}`, { headers }));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }

    for (const request of [
      new NextRequest("https://shop.example/api/admin/square-category-bulk", { headers }),
      new NextRequest("https://shop.example/api/admin/full-catalog-products", { method: "POST", headers })
    ]) {
      const response = await proxy(request);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "STOREFRONT_ADMIN_PREVIEW_READ_ONLY"
      });
    }
  });

  it("allows login while blocking checkout and media before route handlers run", async () => {
    stubAdminPreviewEnvironment();

    const loginResponse = await proxy(new NextRequest("https://shop.example/api/admin/auth/login", {
      method: "POST"
    }));
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("x-middleware-next")).toBe("1");

    for (const pathname of ["/api/checkout", "/api/admin/media", "/api/webhooks/square"]) {
      const response = await proxy(new NextRequest(`https://shop.example${pathname}`, {
        method: "POST"
      }));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "STOREFRONT_ADMIN_PREVIEW_READ_ONLY"
      });
    }
  });

  it("fails closed when an integration secret is present", async () => {
    stubAdminPreviewEnvironment();
    vi.stubEnv("SQUARE_ACCESS_TOKEN", "must-not-be-present");

    const response = await proxy(new NextRequest("https://shop.example/admin/login"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "STOREFRONT_ADMIN_PREVIEW_UNAVAILABLE"
    });
  });
});

function stubAdminPreviewEnvironment() {
  for (const [key, value] of Object.entries(adminPreviewEnvironment)) {
    vi.stubEnv(key, value);
  }
  for (const key of adminPreviewForbiddenSecrets) {
    vi.stubEnv(key, "");
  }
}

const adminPreviewForbiddenSecrets = [
  "NEXT_PUBLIC_SQUARE_APPLICATION_ID",
  "NEXT_PUBLIC_SQUARE_LOCATION_ID",
  "ORDERPRO_AUTH0_CLIENT_ID",
  "ORDERPRO_AUTH0_CLIENT_SECRET",
  "ORDERPRO_STOREFRONT_PREVIEW_SHARED_SECRET",
  "ORDERPRO_STOREFRONT_RETURNS_SHARED_SECRET",
  "ORDERPRO_STOREFRONT_SHIPPING_SHARED_SECRET",
  "RESEND_API_KEY",
  "SHIPPO_API_TOKEN",
  "SHIPPO_WEBHOOK_SECRET",
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_APPLICATION_ID",
  "SQUARE_WEBHOOK_SIGNATURE_KEY",
  "WEBHOOK_WORKER_SECRET"
] as const;
