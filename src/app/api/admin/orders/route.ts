/**
 * Serves authenticated, read-only sales and returns analytics for the admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";
import { readAdminOrderRange, readAdminOrdersAnalytics } from "@/server/admin/admin-orders-analytics";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const analytics = await readAdminOrdersAnalytics(readAdminOrderRange(request.nextUrl.searchParams.get("range")));
    return NextResponse.json({ ok: true, analytics }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      ok: false,
      error: "Sales reporting is unavailable. Confirm Square Payments read access and try again."
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
