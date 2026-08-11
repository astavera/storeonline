/**
 * Handles HTTP requests for the API admin merchandising endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { readWebsiteMerchandisingSnapshot, saveWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";
import { readPostgresAdminCatalogSummary } from "@/server/square/postgres-admin-catalog-store";

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const [catalog, config] = await Promise.all([
    readPostgresAdminCatalogSummary(),
    readWebsiteMerchandisingSnapshot()
  ]);

  return NextResponse.json(
    {
      ok: true,
      config,
      productCount: catalog.variationCount,
      fetchedAt: catalog.updatedAt ?? config.updatedAt
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PUT(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.merchandisingWrite);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json();
    const config = await saveWebsiteMerchandisingSnapshot(body.config);

    return NextResponse.json({ ok: true, config });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "The merchandising configuration is invalid.",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save web merchandising." }, { status: 500 });
  }
}
