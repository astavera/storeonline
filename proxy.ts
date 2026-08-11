/**
 * Applies administrative authorization checks through the root Next.js proxy entry point.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";

export async function proxy(request: NextRequest) {
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

function isPublicAdminAuthPath(pathname: string) {
  return pathname === "/admin/login" || pathname === "/api/admin/auth/login" || pathname === "/api/admin/auth/logout";
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
