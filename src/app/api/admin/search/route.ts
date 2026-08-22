/** Serves permission-scoped federated search for authenticated Admin sessions. */

import { NextRequest, NextResponse } from "next/server";
import { adminCapabilities, adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { parseAdminGlobalSearchQuery, searchAdminGlobal } from "@/server/admin/admin-global-search-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.access);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const parsed = parseAdminGlobalSearchQuery(request.nextUrl.searchParams.get("q"));
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.code, message: parsed.message },
      { status: 400, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const search = await searchAdminGlobal({
      query: parsed.query,
      capabilities: authorization.session.capabilities
    });
    return NextResponse.json(
      { ok: true, ...search },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "ADMIN_SEARCH_UNAVAILABLE", message: "Admin search is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}

