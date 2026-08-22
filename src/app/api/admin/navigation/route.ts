/** Serves controlled Navigation & SEO reads and audited navigation publications. */

import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import {
  NavigationPersistenceUnavailableError,
  NavigationValidationError,
  NavigationVersionConflictError,
  persistAdminNavigation,
  readAdminNavigationSeoWorkspace
} from "@/server/admin/admin-navigation-seo-service";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;
  const authorization = await authorizeAdminRequest(request, "storefront:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const workspace = await readAdminNavigationSeoWorkspace();
    return NextResponse.json({ ok: true, workspace }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return navigationError("Navigation & SEO health is temporarily unavailable.", 503);
  }
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;
  const authorization = await authorizeAdminRequest(request, "storefront:write");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json() as Record<string, unknown>;
    const operation = body.operation === "publish" ? "publish" : body.operation === "save_draft" ? "save_draft" : null;
    if (!operation) return navigationError("Only save_draft and publish are supported.", 400);

    if (operation === "publish") {
      const publishAuthorization = await authorizeAdminRequest(request, "storefront:publish");
      if (!publishAuthorization.ok) return adminAuthorizationResponse(publishAuthorization);
      const rateLimit = await getAdminRateLimiter().consume({
        key: authorization.session.subject,
        scope: "admin-navigation-publish",
        limit: 3,
        windowMs: 60_000
      });
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { ok: false, error: "NAVIGATION_PUBLISH_RATE_LIMITED", message: `Try again in ${rateLimit.retryAfterSeconds} seconds.` },
          { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(rateLimit.retryAfterSeconds) } }
        );
      }
    }

    const result = await persistAdminNavigation({
      actorSubject: authorization.session.subject,
      changeSummary: typeof body.changeSummary === "string" ? body.changeSummary : "",
      expectedVersion: Number(body.expectedVersion),
      navigation: body.navigation,
      operation
    });
    if (operation === "publish") {
      revalidatePath("/", "page");
      revalidatePath("/admin/navigation", "page");
      revalidatePath("/admin/storefront-pages", "page");
    }
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof NavigationValidationError) {
      return NextResponse.json({ ok: false, error: "NAVIGATION_INVALID", errors: error.errors }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
    if (error instanceof NavigationVersionConflictError) return navigationError(error.message, 409, "NAVIGATION_VERSION_CONFLICT");
    if (error instanceof NavigationPersistenceUnavailableError) return navigationError(error.message, 503, "NAVIGATION_PERSISTENCE_UNAVAILABLE");
    return navigationError("Navigation could not be saved.", 503);
  }
}

function navigationError(message: string, status: number, error = "NAVIGATION_UNAVAILABLE") {
  return NextResponse.json({ ok: false, error, message }, { status, headers: { "Cache-Control": "private, no-store" } });
}
