/*
STORE AREA: Commerce
SECTION: Product Grid
SECTION ID: varies by caller
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Tokenized product grid layout using named presets.
SAFE TO EDIT: Grid preset composition and storefront catalog display.
DO NOT EDIT HERE: Product price validation, inventory validation, fulfillment eligibility, or Square writes.
RELATED FILES: src/design/presets/product-grid-presets.ts, src/components/commerce/product-card.tsx
BUSINESS LOGIC FILES: src/features/catalog/services/product-display-service.ts
*/

import type { ProductCardVariant } from "@/design/presets/card-presets";
import { productGridPresets, type ProductGridPresetId } from "@/design/presets/product-grid-presets";
import { getVisibleProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";

export function ProductGrid({
  preset = "editorial",
  cardVariant = "premium",
  limit,
  products
}: {
  preset?: ProductGridPresetId;
  cardVariant?: ProductCardVariant;
  limit?: number;
  products?: StorefrontProduct[];
}) {
  const visibleProducts = products
    ?? (process.env.E2E_CATALOG_FIXTURE === "true" ? getVisibleProducts(limit) : []);

  return (
    <div className={cn("storefront-product-grid grid", productGridPresets[preset])}>
      {visibleProducts.map((product) => (
        <ProductCard key={product.squareVariationId} product={product} variant={cardVariant} />
      ))}
    </div>
  );
}
