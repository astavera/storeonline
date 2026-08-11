/**
 * Resolves category-driven homepage carousel products and optional manual additions.
 */

import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

export function resolveHomepageCarouselProducts({
  fallbackProducts = [],
  products,
  section
}: {
  fallbackProducts?: StorefrontProduct[];
  products: StorefrontProduct[];
  section: HomepageSectionConfig;
}) {
  const categorySlug = section.categorySlug?.trim() ?? "";
  const categoryProducts = categorySlug
    ? products.filter((product) =>
        product.websiteCategorySlugs?.includes(categorySlug)
      )
    : fallbackProducts;
  const productsBySlug = new Map(
    products.map((product) => [product.slug, product])
  );
  const productsByVariation = new Map(
    products.map((product) => [product.squareVariationId, product])
  );
  const manualProducts = (section.items ?? []).flatMap((item) => {
    if (
      item.linkType !== "product" &&
      !item.productSlug &&
      !item.squareVariationId
    ) {
      return [];
    }

    const product =
      (item.squareVariationId
        ? productsByVariation.get(item.squareVariationId)
        : undefined) ??
      (item.productSlug ? productsBySlug.get(item.productSlug) : undefined);

    return product ? [product] : [];
  });
  const seenVariationIds = new Set<string>();

  return [...categoryProducts, ...manualProducts].filter((product) => {
    if (seenVariationIds.has(product.squareVariationId)) {
      return false;
    }

    seenVariationIds.add(product.squareVariationId);
    return true;
  });
}
