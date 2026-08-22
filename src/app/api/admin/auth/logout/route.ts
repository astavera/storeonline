/**
 * Handles HTTP requests for the API admin auth logout endpoint.
 */

import { NextResponse } from "next/server";
import { adminSessionCookieName, isTrustedMutationOrigin } from "@/server/admin/admin-security";
import { revokeAdminSessionToken } from "@/server/admin/identity";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export async function POST(request: Request) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ ok: false, error: "This logout request could not be verified." }, { status: 403 });
  }

  const token = readCookie(request.headers.get("cookie"), adminSessionCookieName);
  if (token && !token.includes(".") && process.env.DATABASE_URL) {
    await revokeAdminSessionToken(token, "USER_LOGOUT").catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(adminSessionCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}
