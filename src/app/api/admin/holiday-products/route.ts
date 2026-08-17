/**
 * Handles HTTP requests for the API admin holiday products endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { applyBulkWebsiteMerchandisingToVariationIds, readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readSquareCatalogCachePage, readSquareVariationIdsByItemIds } from "@/server/square/catalog-test-cache-store";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  holidayId: z.string().trim().min(1).max(120),
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(12).max(48).default(24)
});

const mutationSchema = z.object({
  holidayId: z.string().trim().min(1).max(120),
  itemIds: z.array(z.string().trim().min(1).max(160)).min(1).max(48),
  action: z.enum(["assign", "remove"]),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const config = await readWebsiteMerchandisingSnapshot();
    const holiday = config.holidays.find((item) => item.id === input.holidayId);

    if (!holiday) {
      return NextResponse.json({ ok: false, error: "Save this holiday before managing products." }, { status: 404 });
    }

    const page = readSquareCatalogCachePage({ page: input.page, pageSize: input.pageSize, query: input.q });
    const variationIdsByItem = readSquareVariationIdsByItemIds(page.products.map((product) => product.id));
    const assignedVariationIds = new Set(
      config.placements
        .filter((placement) => placement.holidayAssignments.some((assignment) => assignment.holidayId === holiday.id))
        .map((placement) => placement.squareVariationId)
    );

    return NextResponse.json(
      {
        ok: true,
        ...page,
        assignedVariationCount: assignedVariationIds.size,
        products: page.products.map((product) => {
          const variationIds = variationIdsByItem[product.id] ?? [];
          const assignedCount = variationIds.filter((id) => assignedVariationIds.has(id)).length;
          return {
            ...product,
            assignableVariationCount: variationIds.length,
            assignedVariationCount: assignedCount,
            assignmentStatus: assignedCount === 0 ? "none" : assignedCount === variationIds.length ? "all" : "partial"
          };
        })
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return errorResponse(error, "Unable to load holiday products.");
  }
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.merchandisingWrite);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const input = mutationSchema.parse(await request.json());
    const config = await readWebsiteMerchandisingSnapshot();
    const holiday = config.holidays.find((item) => item.id === input.holidayId);

    if (!holiday) {
      return NextResponse.json({ ok: false, error: "Save this holiday before managing products." }, { status: 404 });
    }
    if (input.startsAt > input.endsAt || input.startsAt < holiday.startDate || input.endsAt > holiday.endDate) {
      return NextResponse.json({ ok: false, error: "Product dates must stay inside the holiday dates." }, { status: 400 });
    }

    const variationIdsByItem = readSquareVariationIdsByItemIds(input.itemIds);
    const variationIds = Array.from(new Set(input.itemIds.flatMap((itemId) => variationIdsByItem[itemId] ?? [])));
    if (variationIds.length === 0) {
      return NextResponse.json({ ok: false, error: "The selected products have no sellable variations." }, { status: 409 });
    }

    const result = await applyBulkWebsiteMerchandisingToVariationIds(variationIds, {
      categoryMode: "keep",
      categoryIds: [],
      brandMode: "keep",
      brandIds: [],
      surfaceMode: "keep",
      surfaceIds: [],
      ageMode: "keep",
      ageGroups: [],
      fulfillmentMode: "keep",
      fulfillmentModes: [],
      holidayMode: input.action,
      holidayId: holiday.id,
      holidayStartsAt: input.startsAt,
      holidayEndsAt: input.endsAt,
      visibilityMode: "keep"
    });

    return NextResponse.json({ ok: true, variationIds, ...result });
  } catch (error) {
    return errorResponse(error, "Unable to update holiday products.");
  }
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: fallback, issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status: 500 });
}
