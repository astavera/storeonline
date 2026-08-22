/**
 * Reads the synchronized Square inventory for the admin workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { readPostgresAdminCatalogPage } from "@/server/square/postgres-admin-catalog-store";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "inventory:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const catalog = await readPostgresAdminCatalogPage({
      page: readPositiveInteger(request.nextUrl.searchParams.get("page")),
      pageSize: readPositiveInteger(request.nextUrl.searchParams.get("pageSize")) ?? 40,
      query: request.nextUrl.searchParams.get("q") ?? ""
    });
    const { products, ...pageData } = catalog;

    return NextResponse.json({
      ok: true,
      ...pageData,
      products,
      pageMetrics: {
        tracked: products.filter((product) => product.inventoryTracked).length,
        lowStock: products.filter((product) => product.inventoryStatus === "limited").length,
        outOfStock: products.filter((product) => product.inventoryStatus === "out-of-stock").length
      }
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      ok: false,
      error: "Inventory is unavailable. Check the Square inventory synchronization and database connection."
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

function readPositiveInteger(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
