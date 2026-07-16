import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { productAgeGroupIds } from "@/features/catalog/product-catalog";
import { websiteSurfaceIds } from "@/features/catalog/services/website-merchandising-service";
import { applyBulkWebsiteMerchandisingToVariationIds } from "@/server/admin/website-merchandising-store";
import {
  readSquareCatalogCategories,
  readSquareVariationIdsByCategory
} from "@/server/square/catalog-test-cache-store";
import { adminAuthorizationResponse, adminCapabilities, authorizeAdminRequest } from "@/server/admin/admin-security";

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
});

const requestSchema = z.object({
  squareCategoryId: z.string().trim().min(1).max(160),
  edit: bulkEditSchema
}).superRefine(({ edit }, context) => {
  const hasValueChange = (
    mode: z.infer<typeof valueModeSchema>,
    count: number
  ) => mode === "replace" || ((mode === "add" || mode === "remove") && count > 0);
  const hasAction =
    hasValueChange(edit.categoryMode, edit.categoryIds.length) ||
    hasValueChange(edit.brandMode, edit.brandIds.length) ||
    hasValueChange(edit.surfaceMode, edit.surfaceIds.length) ||
    hasValueChange(edit.ageMode, edit.ageGroups.length) ||
    hasValueChange(edit.fulfillmentMode, edit.fulfillmentModes.length) ||
    (edit.holidayMode !== "keep" && Boolean(edit.holidayId)) ||
    edit.sortOrder !== undefined ||
    edit.visibilityMode !== "keep";

  if (!hasAction) {
    context.addIssue({ code: "custom", path: ["edit"], message: "Choose at least one bulk change." });
  }
});

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.read);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  return NextResponse.json(
    { ok: true, categories: readSquareCatalogCategories() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request, adminCapabilities.merchandisingWrite);
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = requestSchema.parse(await request.json());
    const categories = readSquareCatalogCategories();
    const squareCategory = categories.find((category) => category.id === body.squareCategoryId);

    if (!squareCategory) {
      return NextResponse.json({ ok: false, error: "The selected Square category is unavailable." }, { status: 404 });
    }

    const variationIds = readSquareVariationIdsByCategory(squareCategory.id);
    if (variationIds.length === 0) {
      return NextResponse.json({ ok: false, error: "This Square category has no sellable, non-archived variations to edit." }, { status: 409 });
    }

    const result = await applyBulkWebsiteMerchandisingToVariationIds(variationIds, body.edit);

    return NextResponse.json({
      ok: true,
      squareCategory,
      matchedVariationCount: variationIds.length,
      ...result
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "The Square category bulk edit is invalid.",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to apply the Square category bulk edit." },
      { status: 500 }
    );
  }
}
