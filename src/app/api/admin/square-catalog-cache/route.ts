/**
 * Handles HTTP requests for the API admin Square catalog cache endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSquareCatalogCachePage } from "@/server/square/catalog-test-cache-store";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const searchParams = request.nextUrl.searchParams;
  const result = readSquareCatalogCachePage({
    categoryId: searchParams.get("categoryId") ?? "",
    query: searchParams.get("q") ?? "",
    page: Number(searchParams.get("page") ?? 1),
    pageSize: Number(searchParams.get("pageSize") ?? 24)
  });

  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
