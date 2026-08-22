/** Serves the immutable administrative audit trail to authorized readers. */

import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import {
  createAdminAuditLogCsvExport,
  parseAdminAuditLogQuery,
  readAdminAuditLog
} from "@/server/admin/admin-audit-log-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const csvRequested = request.nextUrl.searchParams.get("format") === "csv";
  const authorization = await authorizeAdminRequest(request, csvRequested ? "audit:export" : "audit:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const query = parseAdminAuditLogQuery(request.nextUrl.searchParams);
    if (csvRequested) {
      const exported = await createAdminAuditLogCsvExport(query);
      const date = new Date().toISOString().slice(0, 10);
      return new NextResponse(exported.stream, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="modern-state-audit-${date}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
          "X-Audit-Export-Limit": String(exported.rowLimit),
          "X-Audit-Total": String(exported.total),
          "X-Audit-Truncated": String(exported.truncated)
        }
      });
    }
    const result = await readAdminAuditLog(query);
    return NextResponse.json(
      { ok: true, query, ...result },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "The audit trail is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
