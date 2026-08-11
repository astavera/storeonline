/**
 * Defines the proxy module used by the storefront application.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const authorization = await authorizeAdminRequest(request, adminCapabilities.access);
  if (authorization.ok) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(loginUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: "/admin/:path*"
};
