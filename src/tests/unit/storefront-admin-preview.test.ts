/**
 * Verifies the authenticated hosted admin preview remains fail-closed.
 */

import { describe, expect, it } from "vitest";
import { hashAdminPassword } from "@/server/admin/admin-login";
import {
  storefrontAdminPreviewBlockCode,
  isStorefrontAdminPreviewEnabled,
  isStorefrontAdminPreviewModuleAllowed,
  isStorefrontAdminPreviewRequestAllowed
} from "@/server/storefront/admin-preview";

describe("storefront admin preview", () => {
  it("requires PostgreSQL, private admin credentials, the production catalog cache, and disabled write gates", () => {
    const safeEnvironment = adminPreviewEnvironment();

    expect(isStorefrontAdminPreviewEnabled(safeEnvironment)).toBe(true);
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      DATABASE_URL: ""
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      SQUARE_CHECKOUT_ENABLED: "true"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      SQUARE_ACCESS_TOKEN: "must-not-be-present"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      NEXT_PUBLIC_SQUARE_APPLICATION_ID: "must-not-be-present"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      ADMIN_SESSION_SECRET: "too-short"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      ADMIN_SESSION_SECRET: "CHANGE_ME_RANDOM_MINIMUM_32_CHARACTERS"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      ADMIN_LOGIN_EMAIL: "not-an-email"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      ADMIN_PASSWORD_HASH: "scrypt-v1$not-a-real-hash"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      ADMIN_ALLOWED_ORIGINS: "http://shop.example"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      STOREFRONT_DESIGN_PREVIEW: "true"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      E2E_CATALOG_FIXTURE: "true"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontAdminPreviewEnabled({
      ...safeEnvironment,
      SQUARE_ENVIRONMENT: "sandbox"
    })).toThrow("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
  });

  it("allows public reads, exact admin pages, the one catalog read, login, homepage writes, and real catalog cart quotes only", () => {
    const environment = adminPreviewEnvironment();

    expect(allowed("GET", "/", environment)).toBe(true);
    expect(allowed("GET", "/admin", environment)).toBe(true);
    expect(allowed("GET", "/admin/login", environment)).toBe(true);
    expect(allowed("GET", "/admin/homepage", environment)).toBe(true);
    expect(allowed("GET", "/admin/catalog", environment)).toBe(true);
    expect(allowed("GET", "/api/admin/full-catalog-products?q=balloon&page=2", environment)).toBe(true);
    expect(allowed("POST", "/api/admin/auth/login", environment)).toBe(true);
    expect(allowed("POST", "/api/cart", environment)).toBe(true);

    expect(allowed("GET", "/api/admin", environment)).toBe(false);
    expect(allowed("HEAD", "/api/admin/full-catalog-products", environment)).toBe(false);
    expect(allowed("GET", "/api/admin/full-catalog-products/other", environment)).toBe(false);
    expect(allowed("GET", "/api/admin/square-category-bulk", environment)).toBe(false);
    expect(allowed("POST", "/api/admin", environment)).toBe(false);
    expect(allowed("GET", "/admin/homepage?scope=product", environment)).toBe(false);
    expect(allowed("GET", "/admin/orders", environment)).toBe(false);
    expect(allowed("POST", "/api/admin/cms", environment)).toBe(false);
    expect(allowed("PUT", "/api/admin/merchandising", environment)).toBe(false);
    expect(allowed("POST", "/api/admin/media", environment)).toBe(false);
    expect(allowed("PATCH", "/api/admin", environment)).toBe(false);
    expect(allowed("DELETE", "/api/admin", environment)).toBe(false);
    expect(allowed("POST", "/api/checkout", environment)).toBe(false);
    expect(allowed("POST", "/api/account/auth/start", environment)).toBe(false);
    expect(allowed("POST", "/api/internal/square/catalog-sync", environment)).toBe(false);
    expect(allowed("POST", "/api/returns", environment)).toBe(false);
    expect(allowed("POST", "/api/webhooks/square", environment)).toBe(false);
  });

  it("blocks every generic admin control-plane module", () => {
    const environment = adminPreviewEnvironment();

    expect(isStorefrontAdminPreviewModuleAllowed("homepage", environment)).toBe(false);
    expect(isStorefrontAdminPreviewModuleAllowed("theme", environment)).toBe(false);
    expect(isStorefrontAdminPreviewModuleAllowed("orders", environment)).toBe(false);
  });

  it("fails closed when the preview flag is present but not an exact boolean", () => {
    for (const invalidFlag of ["TRUE", " true", "true ", "", "0"]) {
      const environment = {
        ...adminPreviewEnvironment(),
        STOREFRONT_ADMIN_PREVIEW: invalidFlag
      };
      const request = new Request("https://shop.example/api/admin/media", { method: "POST" });

      expect(() => isStorefrontAdminPreviewEnabled(environment)).toThrow(
        "STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID"
      );
      expect(() => isStorefrontAdminPreviewRequestAllowed(request, environment)).toThrow(
        "STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID"
      );
      expect(() => isStorefrontAdminPreviewModuleAllowed("theme", environment)).toThrow(
        "STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID"
      );
      expect(storefrontAdminPreviewBlockCode(request, environment)).toBe(
        "STOREFRONT_ADMIN_PREVIEW_UNAVAILABLE"
      );
    }
  });

  it("keeps an absent or exact false preview flag disabled", () => {
    const withoutFlag = Object.fromEntries(
      Object.entries(adminPreviewEnvironment()).filter(([key]) => key !== "STOREFRONT_ADMIN_PREVIEW")
    );

    expect(isStorefrontAdminPreviewEnabled(withoutFlag)).toBe(false);
    expect(isStorefrontAdminPreviewEnabled({
      ...withoutFlag,
      STOREFRONT_ADMIN_PREVIEW: "false"
    })).toBe(false);
  });
});

function allowed(method: string, pathname: string, environment: Record<string, string>) {
  return isStorefrontAdminPreviewRequestAllowed(
    new Request(`https://shop.example${pathname}`, { method }),
    environment
  );
}

function adminPreviewEnvironment() {
  return {
    STOREFRONT_ADMIN_PREVIEW: "true",
    STOREFRONT_DESIGN_PREVIEW: "false",
    ADMIN_ALLOWED_ORIGINS: "https://shop.example",
    ADMIN_DEV_BYPASS: "false",
    ADMIN_LOGIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD_HASH: validPasswordHash,
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
}

const validPasswordHash = hashAdminPassword(
  "correct-admin-preview-password",
  Buffer.alloc(16, 9)
);
