/**
 * Resolves saved variation IDs against the current public website catalog.
 */

import { NextRequest, NextResponse } from "next/server";
import { storefrontProducts } from "@/features/catalog/product-catalog";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

const maximumRequestedItems = 100;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))).slice(0, maximumRequestedItems)
      : [];

    if (ids.length === 0) return noStoreJson({ products: [], missingIds: [] });

    const catalogSource = process.env.E2E_CATALOG_FIXTURE === "true" ? null : await readResolvedSquareWebsiteCatalog();
    const publicProducts = catalogSource?.catalog.products ?? (process.env.E2E_CATALOG_FIXTURE === "true" ? storefrontProducts : []);
    const productById = new Map(publicProducts.map((product) => [product.squareVariationId, product]));
    const products = ids.map((id) => productById.get(id)).filter((product): product is (typeof publicProducts)[number] => Boolean(product));
    const foundIds = new Set(products.map((product) => product.squareVariationId));

    return noStoreJson({
      products,
      missingIds: ids.filter((id) => !foundIds.has(id))
    });
  } catch (error) {
    return noStoreJson({
      products: [],
      missingIds: [],
      error: error instanceof Error ? error.message : "Wishlist products could not be loaded."
    }, 503);
  }
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
    status
  });
}
