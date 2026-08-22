/** Permission-scoped JSON and CSV access to local Store Admin analytics. */

import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import {
  createAdminAnalyticsCsv,
  parseAdminAnalyticsDateRange,
  readAdminAnalytics
} from "@/server/admin/admin-analytics-service";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const wantsCsv = request.nextUrl.searchParams.get("format") === "csv";
  const authorization = await authorizeAdminRequest(request, wantsCsv ? "analytics:export" : "analytics:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const parsedRange = parseAdminAnalyticsDateRange(request.nextUrl.searchParams);
  if (!parsedRange.ok) {
    return NextResponse.json(
      { ok: false, error: parsedRange.code, message: parsedRange.message },
      { status: 400, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const report = await readAdminAnalytics(parsedRange.range);
    if (wantsCsv) {
      return new NextResponse(createAdminAnalyticsCsv(report), {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="analytics-${report.range.from}-to-${report.range.to}.csv"`,
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { ok: false, error: "ANALYTICS_UNAVAILABLE", message: "Analytics could not be assembled from the local mirrors." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
