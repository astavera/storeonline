/** Serves the permission-scoped, read-only customer support directory. */

import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { parseAdminCustomerQuery, readAdminCustomerDirectory } from "@/server/admin/admin-customer-directory-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "customers:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const query = parseAdminCustomerQuery(request.nextUrl.searchParams);
    const result = await readAdminCustomerDirectory(query);
    return NextResponse.json(
      { ok: true, query, ...result },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "The customer directory is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
