/**
 * Keeps the hosted admin preview isolated from customer and integration writes.
 * Public reads and the real PostgreSQL catalog stay available while only a small,
 * explicit set of authenticated CMS mutations can reach their route handlers.
 */

import "server-only";

import { isValidAdminPasswordHash } from "@/server/admin/admin-login";

type AdminPreviewEnvironment = Record<string, string | undefined>;

export type StorefrontAdminPreviewBlockCode =
  | "STOREFRONT_ADMIN_PREVIEW_READ_ONLY"
  | "STOREFRONT_ADMIN_PREVIEW_UNAVAILABLE";

const exactAdminPreviewValues = {
  ADMIN_DEV_BYPASS: "false",
  ALLOW_LOCAL_PERSISTENCE_FALLBACK: "false",
  CUSTOMER_AUTH_DEV_PREVIEW: "false",
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
  SQUARE_RETURNS_REFUNDS_ENABLED: "false",
  STOREFRONT_DESIGN_PREVIEW: "false"
} as const;

const forbiddenIntegrationSecrets = [
  "ADMIN_MFA_ENCRYPTION_KEY",
  "ADMIN_RECOVERY_CODE_PEPPER",
  "NEXT_PUBLIC_SQUARE_APPLICATION_ID",
  "NEXT_PUBLIC_SQUARE_LOCATION_ID",
  "ORDERPRO_AUTH0_CLIENT_ID",
  "ORDERPRO_AUTH0_CLIENT_SECRET",
  "OPERATIONS_ACCESS_API_TOKEN",
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

const allowedMutations = new Set([
  "POST /api/admin/auth/login",
  "POST /api/admin/auth/logout",
  "POST /api/cart"
]);

const allowedAdminPages = new Set(["/admin", "/admin/catalog", "/admin/homepage", "/admin/login"]);
const allowedAdminReads = new Set(["GET /api/admin/full-catalog-products"]);

export class StorefrontAdminPreviewConfigurationError extends Error {
  readonly code = "STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID";

  constructor() {
    super("STOREFRONT_ADMIN_PREVIEW_CONTRACT_INVALID");
    this.name = "StorefrontAdminPreviewConfigurationError";
  }
}

export function isStorefrontAdminPreviewRequestAllowed(
  request: Pick<Request, "method"> & { url: string },
  environment: AdminPreviewEnvironment = process.env
) {
  if (!isStorefrontAdminPreviewEnabled(environment)) {
    return true;
  }

  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (pathname.startsWith("/api/admin")) {
      return allowedAdminReads.has(`${method} ${pathname}`);
    }
    if (!pathname.startsWith("/admin")) return true;
    if (!allowedAdminPages.has(pathname)) return false;
    return pathname !== "/admin/homepage" || (!url.searchParams.has("scope") && !url.searchParams.has("id"));
  }

  return allowedMutations.has(`${method} ${pathname}`);
}

export function storefrontAdminPreviewBlockCode(
  request: Pick<Request, "method"> & { url: string },
  environment: AdminPreviewEnvironment = process.env
): StorefrontAdminPreviewBlockCode | null {
  try {
    return isStorefrontAdminPreviewRequestAllowed(request, environment)
      ? null
      : "STOREFRONT_ADMIN_PREVIEW_READ_ONLY";
  } catch {
    return "STOREFRONT_ADMIN_PREVIEW_UNAVAILABLE";
  }
}

export function isStorefrontAdminPreviewModuleAllowed(
  _moduleId: string,
  environment: AdminPreviewEnvironment = process.env
) {
  if (!isStorefrontAdminPreviewEnabled(environment)) return true;
  return false;
}

export function isStorefrontAdminPreviewEnabled(
  environment: AdminPreviewEnvironment = process.env
) {
  const previewFlag = environment.STOREFRONT_ADMIN_PREVIEW;
  if (previewFlag === undefined || previewFlag === "false") {
    return false;
  }
  if (previewFlag !== "true") throw new StorefrontAdminPreviewConfigurationError();

  const exactValuesPresent = Object.entries(exactAdminPreviewValues)
    .every(([key, value]) => environment[key] === value);
  const databasesPresent = isPostgresUrl(environment.DATABASE_URL) && isPostgresUrl(environment.DIRECT_URL);
  const adminCredentialsPresent = Boolean(
    isEmail(environment.ADMIN_LOGIN_EMAIL)
    && isValidAdminPasswordHash(environment.ADMIN_PASSWORD_HASH ?? "")
    && isPrivateSessionSecret(environment.ADMIN_SESSION_SECRET)
    && hasOnlySecureOrigins(environment.ADMIN_ALLOWED_ORIGINS)
  );
  const integrationSecretsAbsent = forbiddenIntegrationSecrets
    .every((key) => !environment[key]?.trim());

  if (!exactValuesPresent || !databasesPresent || !adminCredentialsPresent || !integrationSecretsAbsent) {
    throw new StorefrontAdminPreviewConfigurationError();
  }

  return true;
}

function isPrivateSessionSecret(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length >= 32 && !/^CHANGE_ME(?:_|$)/i.test(normalized);
}

function isEmail(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function isPostgresUrl(value: string | undefined) {
  try {
    const parsed = new URL(value ?? "");
    return (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:")
      && Boolean(parsed.hostname && parsed.username && parsed.password && parsed.pathname !== "/");
  } catch {
    return false;
  }
}

function hasOnlySecureOrigins(value: string | undefined) {
  const configured = (value ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (configured.length === 0) return false;

  return configured.every((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "https:"
        && parsed.origin === origin.replace(/\/$/, "")
        && parsed.username === ""
        && parsed.password === "";
    } catch {
      return false;
    }
  });
}
