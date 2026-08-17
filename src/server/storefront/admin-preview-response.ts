/**
 * Converts the pure admin-preview policy into a consistent route response.
 */

import "server-only";

import { NextResponse } from "next/server";
import { storefrontAdminPreviewBlockCode } from "@/server/storefront/admin-preview";

export function storefrontAdminPreviewRouteResponse(request: Request) {
  const error = storefrontAdminPreviewBlockCode(request);
  if (!error) return null;

  return NextResponse.json(
    { ok: false, error },
    { status: 503, headers: { "Cache-Control": "private, no-store" } }
  );
}
