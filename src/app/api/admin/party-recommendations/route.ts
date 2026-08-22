/**
 * Produces review-only Party Supplies merchandising recommendations.
 */

import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  isRecommendablePartyCategory,
  recommendPartyProduct
} from "@/features/catalog/services/party-merchandising-service";
import { websiteCategoryKindIds, type WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { readPartyRecommendationCandidates } from "@/server/admin/party-merchandising-recommendation-store";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const categorySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80),
  description: z.string().max(240).default(""),
  imageUrl: z.string().max(500).default(""),
  imageAlt: z.string().max(160).default(""),
  parentId: z.string().min(1).max(120).nullable().default(null),
  visible: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  kind: z.enum(websiteCategoryKindIds).optional(),
  recommendationTerms: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  swatchColor: z.string().trim().max(7).optional()
});

const requestSchema = z.object({
  targetCategoryId: z.string().min(1).max(120),
  categories: z.array(categorySchema).min(1).max(500)
});

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "catalog:read");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const body = requestSchema.parse(await request.json());
    const categories = body.categories as WebsiteCategory[];
    const targetCategory = categories.find((category) => category.id === body.targetCategoryId);
    if (!targetCategory || !isRecommendablePartyCategory(targetCategory)) {
      return NextResponse.json({ ok: false, error: "Choose a Party Theme, Product Type, or Solid Color category." }, { status: 400 });
    }

    const candidateTerms = Array.from(new Set([
      targetCategory.name,
      ...(targetCategory.recommendationTerms ?? [])
    ].map((term) => term.trim()).filter(Boolean)));
    const products = await readPartyRecommendationCandidates(candidateTerms);
    const recommendations = products.flatMap((product) => {
      const recommendation = recommendPartyProduct(product, targetCategory, categories);
      return recommendation ? [{ product, ...recommendation }] : [];
    }).sort((left, right) => right.confidence - left.confidence || left.product.name.localeCompare(right.product.name)).slice(0, 250);

    return NextResponse.json({
      ok: true,
      targetCategoryId: targetCategory.id,
      recommendations
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ ok: false, error: error.issues[0]?.message ?? "Invalid recommendation request." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to generate recommendations." }, { status: 500 });
  }
}
