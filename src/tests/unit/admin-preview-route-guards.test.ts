/**
 * Verifies route handlers retain the admin-preview boundary without Proxy.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as importBrandGtins } from "@/app/api/admin/brand-gtin-import/route";
import { POST as logoutAdmin } from "@/app/api/admin/auth/logout/route";
import { GET as readAdmin, POST as mutateAdmin } from "@/app/api/admin/route";
import { POST as mutateCms } from "@/app/api/admin/cms/route";
import { GET as readFullCatalog, POST as mutateFullCatalog } from "@/app/api/admin/full-catalog-products/route";
import { GET as readHolidayProducts, POST as mutateHolidayProducts } from "@/app/api/admin/holiday-products/route";
import { POST as uploadMedia } from "@/app/api/admin/media/route";
import { PUT as mutateMerchandising } from "@/app/api/admin/merchandising/route";
import { POST as readPartyRecommendations } from "@/app/api/admin/party-recommendations/route";
import { GET as readSquareCatalogCache } from "@/app/api/admin/square-catalog-cache/route";
import { GET as readSquareCategories } from "@/app/api/admin/square-category-bulk/route";
import { hashAdminPassword } from "@/server/admin/admin-login";

beforeEach(() => {
  const environment = {
    STOREFRONT_ADMIN_PREVIEW: "true",
    STOREFRONT_DESIGN_PREVIEW: "false",
    ADMIN_ALLOWED_ORIGINS: "https://shop.example",
    ADMIN_DEV_BYPASS: "false",
    ADMIN_LOGIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD_HASH: hashAdminPassword("correct-admin-preview-password", Buffer.alloc(16, 9)),
    ADMIN_SESSION_SECRET: "admin-preview-test-secret-with-more-than-32-bytes",
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

  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  for (const key of forbiddenSecrets) vi.stubEnv(key, "");
});

afterEach(() => vi.unstubAllEnvs());

describe("admin preview route guards", () => {
  it("blocks hidden admin reads and mutations before authorization or persistence", async () => {
    const requests = [
      readAdmin(new NextRequest("https://shop.example/api/admin")),
      mutateAdmin(new NextRequest("https://shop.example/api/admin", { method: "POST" })),
      mutateCms(new NextRequest("https://shop.example/api/admin/cms", { method: "POST" })),
      uploadMedia(new NextRequest("https://shop.example/api/admin/media", { method: "POST" })),
      mutateMerchandising(new NextRequest("https://shop.example/api/admin/merchandising", { method: "PUT" })),
      mutateFullCatalog(new NextRequest("https://shop.example/api/admin/full-catalog-products", { method: "POST" })),
      readHolidayProducts(new NextRequest("https://shop.example/api/admin/holiday-products")),
      mutateHolidayProducts(new NextRequest("https://shop.example/api/admin/holiday-products", { method: "POST" })),
      importBrandGtins(new NextRequest("https://shop.example/api/admin/brand-gtin-import", { method: "POST" })),
      readPartyRecommendations(new NextRequest("https://shop.example/api/admin/party-recommendations", { method: "POST" })),
      readSquareCatalogCache(new NextRequest("https://shop.example/api/admin/square-catalog-cache")),
      readSquareCategories(new NextRequest("https://shop.example/api/admin/square-category-bulk"))
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "STOREFRONT_ADMIN_PREVIEW_READ_ONLY"
      });
    }
  });

  it("lets only the full-catalog GET reach authentication while keeping its mutation blocked", async () => {
    const readResponse = await readFullCatalog(
      new NextRequest("https://shop.example/api/admin/full-catalog-products?q=balloon")
    );
    expect(readResponse.status).toBe(401);

    const mutationResponse = await mutateFullCatalog(
      new NextRequest("https://shop.example/api/admin/full-catalog-products", { method: "POST" })
    );
    expect(mutationResponse.status).toBe(503);
    await expect(mutationResponse.json()).resolves.toEqual({
      ok: false,
      error: "STOREFRONT_ADMIN_PREVIEW_READ_ONLY"
    });
  });

  it("fails closed at the route when the environment contract drifts", async () => {
    vi.stubEnv("SQUARE_ACCESS_TOKEN", "must-not-be-present");

    const response = await uploadMedia(new NextRequest("https://shop.example/api/admin/media", { method: "POST" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "STOREFRONT_ADMIN_PREVIEW_UNAVAILABLE"
    });
  });

  it("fails closed inside an otherwise allowed auth route when the preview flag is malformed", async () => {
    vi.stubEnv("STOREFRONT_ADMIN_PREVIEW", "TRUE");

    const response = await logoutAdmin(new NextRequest("https://shop.example/api/admin/auth/logout", { method: "POST" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "STOREFRONT_ADMIN_PREVIEW_UNAVAILABLE"
    });
  });

  it("installs the close-to-handler guard in every admin API route", () => {
    const routeFiles = collectRouteFiles(resolve(process.cwd(), "src/app/api/admin"));

    expect(routeFiles.length).toBeGreaterThan(0);
    for (const routeFile of routeFiles) {
      const source = readFileSync(routeFile, "utf8");
      const exportedHandlers = source.match(/export async function (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(/gu) ?? [];
      const routeGuards = source.match(/const previewResponse = storefrontAdminPreviewRouteResponse\(request\);/gu) ?? [];

      expect(source, routeFile).toContain("storefrontAdminPreviewRouteResponse");
      expect(source, routeFile).toMatch(/export async function (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\([^)]*request[^)]*\) \{\s*const previewResponse = storefrontAdminPreviewRouteResponse\(request\);/u);
      expect(routeGuards, routeFile).toHaveLength(exportedHandlers.length);
    }
  });
});

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(path);
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  });
}

const forbiddenSecrets = [
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
