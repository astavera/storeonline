/**
 * Handles HTTP requests for the API admin Square category bulk endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { readPostgresAdminCatalogCategories } from "@/server/square/postgres-admin-catalog-store";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "catalog:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  return NextResponse.json(
    { ok: true, categories: await readPostgresAdminCatalogCategories() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
