/**
 * Handles HTTP requests for the API admin brand GTIN import endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prepareBrandGtinImport } from "@/features/catalog/services/brand-gtin-import-service";
import { applyBulkWebsiteMerchandisingToVariationIds, readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readSquareVariationsByCanonicalGtins } from "@/server/square/catalog-test-cache-store";
import { adminAuthorizationResponse, authorizeAdminRequest } from "@/server/admin/admin-security";
import { storefrontAdminPreviewRouteResponse } from "@/server/storefront/admin-preview-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  brandId: z.string().trim().min(1).max(120),
  gtins: z.array(z.string().max(64)).min(1).max(25_000),
  operation: z.enum(["preview", "assign", "remove"])
});

export async function POST(request: NextRequest) {
  const previewResponse = storefrontAdminPreviewRouteResponse(request);
  if (previewResponse) return previewResponse;

  const authorization = await authorizeAdminRequest(request, "catalog:merchandise");
  if (!authorization.ok) return adminAuthorizationResponse(authorization);

  try {
    const input = requestSchema.parse(await request.json());
    const config = await readWebsiteMerchandisingSnapshot();
    const brand = config.brands.find((item) => item.id === input.brandId);
    if (!brand) {
      return NextResponse.json({ ok: false, error: "Save this brand before importing GTINs." }, { status: 404 });
    }

    const prepared = prepareBrandGtinImport(input.gtins);
    if (prepared.canonicalGtins.length === 0) {
      return NextResponse.json({ ok: false, error: "The CSV has no valid GTIN or UPC values." }, { status: 400 });
    }

    const matches = readSquareVariationsByCanonicalGtins(prepared.canonicalGtins);
    const variationIds = Array.from(new Set(matches.map((match) => match.variationId)));
    const matchedCanonicalGtins = new Set(matches.map((match) => match.canonicalGtin));
    const unmatchedGtins = prepared.canonicalGtins
      .filter((gtin) => !matchedCanonicalGtins.has(gtin))
      .map((gtin) => prepared.inputByCanonicalGtin[gtin]);
    const duplicateCatalogGtins = Array.from(
      matches.reduce((counts, match) => counts.set(match.canonicalGtin, (counts.get(match.canonicalGtin) ?? 0) + 1), new Map<string, number>())
    ).filter(([, count]) => count > 1).map(([gtin]) => prepared.inputByCanonicalGtin[gtin]);

    const baseResponse = {
      ok: true,
      brand: { id: brand.id, name: brand.name },
      nonEmptyInputCount: prepared.nonEmptyInputCount,
      uniqueGtinCount: prepared.canonicalGtins.length,
      duplicateInputCount: prepared.duplicateCount,
      invalidInputs: prepared.invalidInputs,
      invalidInputCount: prepared.invalidInputs.length,
      matchedGtinCount: matchedCanonicalGtins.size,
      matchedVariationCount: variationIds.length,
      unmatchedGtins,
      unmatchedGtinCount: unmatchedGtins.length,
      duplicateCatalogGtins,
      sampleMatches: matches.slice(0, 12).map((match) => ({
        gtin: prepared.inputByCanonicalGtin[match.canonicalGtin] ?? match.gtin,
        itemName: match.itemName,
        variationId: match.variationId,
        variationName: match.variationName
      }))
    };

    if (input.operation === "preview") {
      return NextResponse.json(baseResponse, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (variationIds.length === 0) {
      return NextResponse.json({ ...baseResponse, ok: false, error: "None of these GTINs match a sellable Square variation." }, { status: 409 });
    }

    const result = await applyBulkWebsiteMerchandisingToVariationIds(variationIds, {
      categoryMode: "keep",
      categoryIds: [],
      brandMode: input.operation === "assign" ? "add" : "remove",
      brandIds: [brand.id],
      surfaceMode: "keep",
      surfaceIds: [],
      ageMode: "keep",
      ageGroups: [],
      fulfillmentMode: "keep",
      fulfillmentModes: [],
      holidayMode: "keep",
      visibilityMode: "keep"
    });
    const updatedConfig = await readWebsiteMerchandisingSnapshot();
    const assignedVariationCount = updatedConfig.placements.filter((placement) => placement.brandIds.includes(brand.id)).length;

    return NextResponse.json({ ...baseResponse, variationIds, assignedVariationCount, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({
        ok: false,
        error: "The Brand GTIN import is invalid.",
        issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to import Brand GTINs." }, { status: 500 });
  }
}
