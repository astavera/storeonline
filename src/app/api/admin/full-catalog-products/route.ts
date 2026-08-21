/**
 * Handles HTTP requests for the API admin full catalog products endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { productAgeGroupIds } from "@/features/catalog/product-catalog";
import { partyAssignmentIssues } from "@/features/catalog/services/party-merchandising-service";
import type { WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";
import { websitePlacementReadinessIssues, websiteSurfaceIds } from "@/features/catalog/services/website-merchandising-service";
import {
  applyBulkWebsiteMerchandisingToVariationIds,
  parseWebsiteProductPlacement,
  readWebsiteMerchandisingSnapshot,
  saveWebsiteProductPlacement
} from "@/server/admin/website-merchandising-store";
import { saveProductShippingProfile } from "@/server/products/product-shipping-profile-store";
import {
  readPostgresAdminCatalogPage,
  readPostgresAdminProductsByVariationIds,
  readPostgresAdminVariationSelection,
  type PostgresCatalogImageFilter
} from "@/server/square/postgres-admin-catalog-store";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const valueModeSchema = z.enum(["keep", "add", "remove", "replace"]);
const bulkEditSchema = z.object({
  categoryMode: valueModeSchema,
  categoryIds: z.array(z.string().min(1).max(120)).max(30),
  brandMode: valueModeSchema,
  brandIds: z.array(z.string().min(1).max(120)).max(20),
  surfaceMode: valueModeSchema,
  surfaceIds: z.array(z.enum(websiteSurfaceIds)).max(websiteSurfaceIds.length),
  ageMode: valueModeSchema,
  ageGroups: z.array(z.enum(productAgeGroupIds)).max(productAgeGroupIds.length),
  fulfillmentMode: valueModeSchema,
  fulfillmentModes: z.array(z.enum(["pickup", "local-delivery", "shipping"])).max(3),
  holidayMode: z.enum(["keep", "assign", "remove"]),
  holidayId: z.string().min(1).max(120).optional(),
  holidayStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  holidayEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  sortStep: z.number().int().min(0).max(1_000_000).optional(),
  visibilityMode: z.enum(["keep", "hidden", "publish-ready"])
}).superRefine((edit, context) => {
  const changesValues = (mode: z.infer<typeof valueModeSchema>, count: number) => mode === "replace" || ((mode === "add" || mode === "remove") && count > 0);
  const hasAction =
    changesValues(edit.categoryMode, edit.categoryIds.length) ||
    changesValues(edit.brandMode, edit.brandIds.length) ||
    changesValues(edit.surfaceMode, edit.surfaceIds.length) ||
    changesValues(edit.ageMode, edit.ageGroups.length) ||
    changesValues(edit.fulfillmentMode, edit.fulfillmentModes.length) ||
    (edit.holidayMode !== "keep" && Boolean(edit.holidayId)) ||
    edit.sortOrder !== undefined ||
    edit.visibilityMode !== "keep";

  if (!hasAction) context.addIssue({ code: "custom", message: "Choose at least one bulk change." });
  if (edit.holidayMode === "assign" && (!edit.holidayId || !edit.holidayStartsAt || !edit.holidayEndsAt)) {
    context.addIssue({ code: "custom", path: ["holidayId"], message: "Choose a holiday and its product date range." });
  }
});

const bulkRequestSchema = z.object({
  variationIds: z.array(z.string().trim().min(1).max(160)).min(1).max(5_000),
  edit: bulkEditSchema
});

export async function GET(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  const page = readPositiveInteger(request.nextUrl.searchParams.get("page"));
  const pageSize = readPositiveInteger(request.nextUrl.searchParams.get("pageSize"));
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const categoryId = request.nextUrl.searchParams.get("categoryId") ?? "";
  const vendorId = request.nextUrl.searchParams.get("vendorId") ?? "";
  const websiteCategoryId = request.nextUrl.searchParams.get("websiteCategoryId") ?? "";
  const requestedWebsiteSurfaceId = request.nextUrl.searchParams.get("websiteSurfaceId") ?? "";
  const websiteSurfaceId = websiteSurfaceIds.find(
    (surfaceId) => surfaceId === requestedWebsiteSurfaceId
  );
  const imageFilter = readImageFilter(request.nextUrl.searchParams.get("images"));
  const config = await readWebsiteMerchandisingSnapshot();

  if (websiteCategoryId && !config.categories.some((category) => category.id === websiteCategoryId)) {
    return NextResponse.json({ ok: false, error: "The selected website category no longer exists. Refresh Products and try again." }, { status: 400 });
  }

  const assignedVariationIds = websiteCategoryId || websiteSurfaceId
    ? config.placements
        .filter(
          (placement) =>
            (!websiteCategoryId || placement.categoryIds.includes(websiteCategoryId)) &&
            (!websiteSurfaceId || placement.surfaceIds.includes(websiteSurfaceId))
        )
        .map((placement) => placement.squareVariationId)
    : undefined;
  const cacheQuery = { query, categoryId, vendorId, imageFilter, variationIds: assignedVariationIds };

  if (request.nextUrl.searchParams.get("selection") === "matching") {
    return NextResponse.json({
      ok: true,
      websiteCategoryId,
      websiteSurfaceId,
      ...await readPostgresAdminVariationSelection(cacheQuery, 5_000)
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const catalogPage = await readPostgresAdminCatalogPage({
    ...cacheQuery,
    page,
    pageSize
  });
  const { products, ...pageData } = catalogPage;
  const placementByVariationId = new Map(config.placements.map((placement) => [placement.squareVariationId, placement]));

  return NextResponse.json({
    ok: true,
    ...pageData,
    websiteCategoryId,
    websiteSurfaceId,
    records: products.map((product, index) => ({
      product,
      placement: placementByVariationId.get(product.squareVariationId) ?? createPendingPlacement(product.squareVariationId, (catalogPage.page - 1) * catalogPage.pageSize + index),
      saved: placementByVariationId.has(product.squareVariationId)
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, adminCapabilities.merchandisingWrite);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = await request.json() as { placement?: unknown; shippingProfile?: unknown; variationIds?: unknown };

    if (body && typeof body === "object" && "variationIds" in body) {
      const bulkRequest = bulkRequestSchema.parse(body);
      const variationIds = Array.from(new Set(bulkRequest.variationIds));
      const matchedProducts = await readPostgresAdminProductsByVariationIds(variationIds);

      if (matchedProducts.length !== variationIds.length) {
        return NextResponse.json({ ok: false, error: "One or more selected Square variations are no longer available. Refresh Products and select them again." }, { status: 409 });
      }

      if (bulkRequest.edit.categoryMode === "add" || bulkRequest.edit.categoryMode === "replace") {
        const config = await readWebsiteMerchandisingSnapshot();
        const issues = matchedProducts.flatMap((product) => partyAssignmentIssues(product, bulkRequest.edit.categoryIds, config.categories));
        if (issues.length > 0) {
          return NextResponse.json({ ok: false, error: issues[0], issues: issues.slice(0, 20).map((message) => ({ message })) }, { status: 400 });
        }
      }

      const result = await applyBulkWebsiteMerchandisingToVariationIds(variationIds, bulkRequest.edit);
      return NextResponse.json({ ok: true, mode: "bulk", matchedVariationCount: variationIds.length, ...result });
    }

    const placement = parseWebsiteProductPlacement(body.placement);
    const variationId = placement.squareVariationId;

    const matchedProducts = variationId ? await readPostgresAdminProductsByVariationIds([variationId]) : [];
    if (!variationId || matchedProducts.length === 0) {
      return NextResponse.json({ ok: false, error: "This Square variation is not available in the full catalog cache." }, { status: 404 });
    }

    const configBeforeSave = await readWebsiteMerchandisingSnapshot();
    const assignmentIssues = partyAssignmentIssues(matchedProducts[0], placement.categoryIds, configBeforeSave.categories);
    if (assignmentIssues.length > 0) {
      return NextResponse.json({ ok: false, error: assignmentIssues[0] }, { status: 400 });
    }

    // Save the physical policy first. This ordering fails closed: removals take
    // effect before CMS publication, while additions cannot surface until CMS
    // also saves successfully.
    const shippingProfile = await saveProductShippingProfile(placement, body.shippingProfile);
    const result = await saveWebsiteProductPlacement(placement);
    const config = await readWebsiteMerchandisingSnapshot();
    const issues = websitePlacementReadinessIssues(result.placement, config.categories, config.holidays);

    return NextResponse.json({ ok: true, ...result, shippingProfile, issues });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({
        ok: false,
        error: "The product placement is invalid.",
        issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save this product." }, { status: 500 });
  }
}

function readPositiveInteger(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readImageFilter(value: string | null): PostgresCatalogImageFilter {
  return value === "with" || value === "without" ? value : "all";
}

function createPendingPlacement(squareVariationId: string, sortOrder: number): WebsiteProductPlacement {
  return {
    squareVariationId,
    categoryIds: [],
    brandIds: [],
    holidayAssignments: [],
    ageGroups: [],
    fulfillmentModes: [],
    surfaceIds: [],
    visible: false,
    sortOrder
  };
}
