/**
 * Applies the hosted preview boundary and administrative authorization checks.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { isStorefrontAdminPreviewRequestAllowed } from "@/server/storefront/admin-preview";
import { isStorefrontDesignPreviewRequestAllowed } from "@/server/storefront/design-preview";

export async function proxy(request: NextRequest) {
  if (shouldShowMaintenancePage(request.nextUrl.pathname)) {
    const maintenanceUrl = request.nextUrl.clone();
    maintenanceUrl.pathname = "/maintenance.html";
    maintenanceUrl.search = "";

    const response = NextResponse.rewrite(maintenanceUrl);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  try {
    if (!isStorefrontDesignPreviewRequestAllowed(request)) {
      return NextResponse.json(
        { ok: false, error: "STOREFRONT_DESIGN_PREVIEW_READ_ONLY" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } }
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "STOREFRONT_DESIGN_PREVIEW_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    if (!isStorefrontAdminPreviewRequestAllowed(request)) {
      return NextResponse.json(
        { ok: false, error: "STOREFRONT_ADMIN_PREVIEW_READ_ONLY" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } }
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "STOREFRONT_ADMIN_PREVIEW_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  if (!isAdminPath(request.nextUrl.pathname)) return NextResponse.next();
  if (isPublicAdminAuthPath(request.nextUrl.pathname)) return NextResponse.next();

  const authorization = await authorizeAdminRequest(request);
  if (authorization.ok) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/admin")) {
    return adminAuthorizationResponse(authorization);
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(loginUrl);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

function shouldShowMaintenancePage(pathname: string) {
  if (process.env.STOREFRONT_MAINTENANCE_MODE?.trim().toLowerCase() !== "true") {
    return false;
  }

  return !pathname.startsWith("/admin") && !pathname.startsWith("/api");
}

function isPublicAdminAuthPath(pathname: string) {
  return pathname === "/admin/login" || pathname === "/api/admin/auth/login" || pathname === "/api/admin/auth/logout";
}

function isAdminPath(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"
};
