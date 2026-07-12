/*
STORE AREA: Commerce
SECTION: Product Card
SECTION ID: commerce.product-card
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Product visual presentation for Square-cached items plus website display overrides.
SAFE TO EDIT: Card variants, badges, image ratio, and display-only copy.
DO NOT EDIT HERE: Price validation, inventory validation, Square catalog writes, or checkout calculations.
RELATED FILES: src/design/presets/card-presets.ts, src/config/store-section-registry.ts
BUSINESS LOGIC FILES: src/features/catalog/services/product-display-service.ts, src/server/square/catalog-sync.ts
*/

import { cardPresets, type ProductCardVariant } from "@/design/presets/card-presets";
import { fulfillmentModeLabel, type FulfillmentMode } from "@/features/catalog/product-catalog";
import { cn, formatMoney } from "@/lib/utils";
import { AddToCartButton } from "./add-to-cart-button";
import { Heart } from "lucide-react";

export type ProductCardData = {
  squareVariationId: string;
  slug: string;
  name: string;
  department: string;
  shortDescription: string;
  imageUrl: string;
  priceCents: number;
  badge?: string;
  fulfillmentModes: FulfillmentMode[];
  inventoryStatus: "in-stock" | "limited" | "special-order";
};

export function ProductCard({ product, variant = "premium" }: { product: ProductCardData; variant?: ProductCardVariant }) {
  const productImage = product.imageUrl || "/images/product-fallback.svg";
  const inventoryLabel = product.inventoryStatus === "limited" ? "Limited stock" : product.inventoryStatus === "special-order" ? "Special order" : "In stock";

  return (
    <article className={cn("group relative flex min-h-[510px] flex-col overflow-hidden rounded-md bg-surface", cardPresets[variant])} data-cms-edit-field="linkedProduct" data-product-slug={product.slug} data-store-component="ProductCard" data-store-variant={variant}>
      <button aria-label={`Save ${product.name}`} className="absolute right-4 top-4 z-10 rounded-full bg-white/95 p-2 text-primary shadow-sm transition hover:text-red" type="button">
        <Heart aria-hidden="true" size={18} />
      </button>
      <a className="block aspect-square bg-white p-6" href={`/products/${product.slug}`}>
        <img alt={product.name} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.04]" src={productImage} />
      </a>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-blue" data-cms-edit-field="productDepartment">{product.department}</p>
          {product.badge ? <span className="rounded-pill bg-[var(--theme-accent-soft)] px-2 py-1 text-xs font-black" data-cms-edit-field="productBadge">{product.badge}</span> : null}
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-black leading-snug" data-cms-edit-field="productTitle">
            <a className="hover:text-blue" href={`/products/${product.slug}`}>
              {product.name}
            </a>
          </h3>
          <p className="mt-2 line-clamp-2 min-h-10 text-sm text-secondary" data-cms-edit-field="productDescription">{product.shortDescription}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {product.fulfillmentModes.map((mode) => (
            <span className="rounded-md border border-border bg-surface-muted px-2 py-1 text-[11px] font-bold text-secondary" key={mode}>
              {fulfillmentModeLabel(mode)}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black text-green">{inventoryLabel}</p>
          <p className="text-xl font-black text-primary">{formatMoney(product.priceCents)}</p>
        </div>
        <AddToCartButton squareVariationId={product.squareVariationId} />
      </div>
    </article>
  );
}
