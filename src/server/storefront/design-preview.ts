/**
 * Keeps the hosted design preview read-only and independent from production
 * persistence. The preview is active only when its fixture and every customer
 * write gate are explicitly in the safe state.
 */

import "server-only";

type DesignPreviewEnvironment = Record<string, string | undefined>;

const exactPreviewValues = {
  ADMIN_DEV_BYPASS: "false",
  ALLOW_LOCAL_PERSISTENCE_FALLBACK: "false",
  CUSTOMER_AUTH_DEV_PREVIEW: "false",
  E2E_CATALOG_FIXTURE: "true",
  NEXT_PUBLIC_SITE_INDEXABLE: "false",
  ORDERPRO_M2M_AUTH_MODE: "DISABLED",
  ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: "false",
  ORDERPRO_RETURNS_ENABLED: "false",
  ORDERPRO_SHIPPING_CHECKOUT_ENABLED: "false",
  SHIPPO_TEST_MODE: "true",
  SQUARE_ALLOW_PRODUCTION_READONLY_SYNC: "false",
  SQUARE_CHECKOUT_ENABLED: "false",
  SQUARE_ENVIRONMENT: "sandbox",
  SQUARE_RETURNS_REFUNDS_ENABLED: "false"
} as const;

export class StorefrontDesignPreviewConfigurationError extends Error {
  readonly code = "STOREFRONT_DESIGN_PREVIEW_CONTRACT_INVALID";

  constructor() {
    super("STOREFRONT_DESIGN_PREVIEW_CONTRACT_INVALID");
    this.name = "StorefrontDesignPreviewConfigurationError";
  }
}

export function isStorefrontDesignPreviewRequestAllowed(
  request: Pick<Request, "method"> & { url: string },
  environment: DesignPreviewEnvironment = process.env
) {
  if (!isStorefrontDesignPreviewEnabled(environment)) {
    return true;
  }

  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  return method === "POST" && new URL(request.url).pathname === "/api/cart";
}

export function isStorefrontDesignPreviewEnabled(
  environment: DesignPreviewEnvironment = process.env
) {
  if (environment.STOREFRONT_DESIGN_PREVIEW !== "true") {
    return false;
  }

  const exactValuesPresent = Object.entries(exactPreviewValues)
    .every(([key, value]) => environment[key] === value);
  const databasesAbsent = !environment.DATABASE_URL?.trim() && !environment.DIRECT_URL?.trim();

  if (!exactValuesPresent || !databasesAbsent) {
    throw new StorefrontDesignPreviewConfigurationError();
  }

  return true;
}
