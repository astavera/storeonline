/**
 * Verifies the hosted design preview remains read-only and database-free.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublishedHomepageState } from "@/features/homepage/server";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { quoteCartFromOperationalCatalog } from "@/server/checkout/cart-service";
import { requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";
import {
  isStorefrontDesignPreviewEnabled,
  isStorefrontDesignPreviewRequestAllowed
} from "@/server/storefront/design-preview";
import { readPublishedStorefrontCmsDocument } from "@/server/storefront/published-cms-document";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storefront design preview", () => {
  it("requires the fixture, non-indexable site, and disabled write gates", () => {
    const safeEnvironment = previewEnvironment();

    expect(isStorefrontDesignPreviewEnabled(safeEnvironment)).toBe(true);
    expect(() => isStorefrontDesignPreviewEnabled({
      ...safeEnvironment,
      SQUARE_CHECKOUT_ENABLED: "true"
    })).toThrow("STOREFRONT_DESIGN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontDesignPreviewEnabled({
      ...safeEnvironment,
      NEXT_PUBLIC_SITE_INDEXABLE: "true"
    })).toThrow("STOREFRONT_DESIGN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontDesignPreviewEnabled({
      ...safeEnvironment,
      E2E_CATALOG_FIXTURE: "false"
    })).toThrow("STOREFRONT_DESIGN_PREVIEW_CONTRACT_INVALID");
    expect(() => isStorefrontDesignPreviewEnabled({
      ...safeEnvironment,
      DATABASE_URL: "postgresql://preview-should-not-use-a-database"
    })).toThrow("STOREFRONT_DESIGN_PREVIEW_CONTRACT_INVALID");
  });

  it("renders the built-in homepage state without PostgreSQL", async () => {
    enableSafePreviewEnvironment();

    const state = await getPublishedHomepageState();

    expect(state.sections.length).toBeGreaterThan(0);
    expect(state.workspace).toMatchObject({ id: "main", status: "PUBLISHED" });
    expect(state.versions).toEqual([]);
  });

  it("lets public CMS pages use their built-in defaults without PostgreSQL", async () => {
    enableSafePreviewEnvironment();

    await expect(readPublishedStorefrontCmsDocument({
      entityType: "landing",
      entityId: "shop"
    })).resolves.toBeNull();

    await expect(readLatestCmsDocument({
      entityType: "landing",
      entityId: "shop",
      statuses: ["PUBLISHED"]
    })).rejects.toThrow("CMS persistence is unavailable");
  });

  it("quotes the fixture cart without enabling checkout persistence", async () => {
    enableSafePreviewEnvironment();

    const quote = await quoteCartFromOperationalCatalog({
      items: [{ squareVariationId: "seed-toy-building-set", quantity: 1 }]
    });

    expect(quote).toMatchObject({
      catalogSource: "static-preview",
      itemCount: 1
    });
    expect(quote.errors).toEqual([]);
  });

  it("does not relax the shared persistence policy for write paths", () => {
    enableSafePreviewEnvironment();

    expect(() => requireDatabaseOrDevelopmentFallback("preview write"))
      .toThrow("preview write persistence is unavailable");
  });

  it("allows only read requests and the read-only cart quote endpoint", () => {
    const environment = previewEnvironment();

    expect(isStorefrontDesignPreviewRequestAllowed(
      new Request("https://shop.example/", { method: "GET" }),
      environment
    )).toBe(true);
    expect(isStorefrontDesignPreviewRequestAllowed(
      new Request("https://shop.example/api/cart", { method: "POST" }),
      environment
    )).toBe(true);
    expect(isStorefrontDesignPreviewRequestAllowed(
      new Request("https://shop.example/api/checkout", { method: "POST" }),
      environment
    )).toBe(false);
    expect(isStorefrontDesignPreviewRequestAllowed(
      new Request("https://shop.example/api/admin", { method: "POST" }),
      environment
    )).toBe(false);
  });
});

function enableSafePreviewEnvironment() {
  for (const [key, value] of Object.entries(previewEnvironment())) {
    vi.stubEnv(key, value);
  }
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DIRECT_URL", "");
  vi.stubEnv("ALLOW_LOCAL_PERSISTENCE_FALLBACK", "false");
}

function previewEnvironment() {
  return {
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
}
