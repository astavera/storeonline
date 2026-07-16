import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { readWebsiteMerchandising, saveWebsiteMerchandising } from "@/server/admin/website-merchandising-store";
import { readSquareCatalogPreview } from "@/server/square/catalog-preview-store";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const catalog = await readSquareCatalogPreview();

  if (!catalog) {
    return NextResponse.json({ ok: false, error: "The local Square catalog snapshot is unavailable." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    config: await readWebsiteMerchandising(catalog.products),
    productCount: catalog.products.length,
    fetchedAt: catalog.fetchedAt
  });
}

export async function PUT(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.merchandisingWrite);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const catalog = await readSquareCatalogPreview();

    if (!catalog) {
      return NextResponse.json({ ok: false, error: "The local Square catalog snapshot is unavailable." }, { status: 503 });
    }

    const body = await request.json();
    const config = await saveWebsiteMerchandising(body.config, catalog.products);

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
