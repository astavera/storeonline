/**
 * Handles HTTP requests for the API admin auth logout endpoint.
 */

import { NextResponse } from "next/server";
import { adminSessionCookieName, isTrustedMutationOrigin } from "@/server/admin/admin-security";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export async function POST(request: Request) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "Unable to sign out." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
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
