import { NextRequest, NextResponse } from "next/server";
import { readPostgresAdminCatalogCategories } from "@/server/square/postgres-admin-catalog-store";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  return NextResponse.json(
    { ok: true, categories: await readPostgresAdminCatalogCategories() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
