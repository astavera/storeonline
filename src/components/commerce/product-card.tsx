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
import { fulfillmentModeLabel, type FulfillmentMode, type ProductAgeGroup } from "@/features/catalog/product-catalog";
import { cn, formatMoney } from "@/lib/utils";
import Image from "next/image";
import { AddToCartButton } from "./add-to-cart-button";
import { WishlistButton } from "./wishlist-button";
import { ShoppingCart } from "lucide-react";

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
  inventoryStatus: "in-stock" | "limited" | "special-order" | "out-of-stock";
  priceAvailable?: boolean;
  ageGroups?: ProductAgeGroup[];
  previewOnly?: boolean;
};

export function ProductCard({ product, variant = "premium" }: { product: ProductCardData; variant?: ProductCardVariant }) {
  const productImage = product.imageUrl || "/images/product-fallback.svg";
  const purchaseDisabled = product.inventoryStatus === "out-of-stock" || product.priceAvailable === false;
  const disabledReason = product.priceAvailable === false ? "Price unavailable" : "Out of stock";
  const inventoryLabel = product.previewOnly
    ? "Check availability by location"
    : product.inventoryStatus === "limited"
      ? "Limited stock"
      : product.inventoryStatus === "out-of-stock"
        ? "Out of stock"
      : product.inventoryStatus === "special-order"
        ? "Special order"
        : "In stock";
  const productImageElement = (
    <span className="product-card-image-frame">
      <Image
        alt={product.name}
        className="product-card-image object-contain"
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
        src={productImage}
        unoptimized
      />
    </span>
  );

  return (
    <article className={cn("storefront-product-card group relative flex min-h-[510px] flex-col overflow-hidden rounded-md bg-surface", cardPresets[variant])} data-cms-edit-field="linkedProduct" data-inventory-status={product.inventoryStatus} data-product-slug={product.slug} data-store-component="ProductCard" data-store-variant={variant}>
      {product.previewOnly ? (
        <div className="product-card-media block aspect-square bg-white p-6">{productImageElement}</div>
      ) : (
        <a className="product-card-media block aspect-square bg-white p-6" href={`/products/${product.slug}`}>
          {productImageElement}
        </a>
      )}
      <div className="product-card-content flex flex-1 flex-col gap-3 p-4">
        <div className="product-card-meta flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-blue" data-cms-edit-field="productDepartment">{product.department}</p>
          {product.badge ? <span className="rounded-pill bg-[var(--theme-accent-soft)] px-2 py-1 text-xs font-black" data-cms-edit-field="productBadge">{product.badge}</span> : null}
        </div>
        <div className="product-card-title-wrap flex-1">
          <h3 className="font-display text-base font-black leading-snug" data-cms-edit-field="productTitle">
            {product.previewOnly ? product.name : (
              <a className="hover:text-blue" href={`/products/${product.slug}`}>
                {product.name}
              </a>
            )}
          </h3>
        </div>
        <div className="product-card-fulfillment flex flex-wrap gap-1">
          {product.fulfillmentModes.map((mode) => (
            <span className="rounded-md border border-border bg-surface-muted px-2 py-1 text-[11px] font-bold text-secondary" key={mode}>
              {fulfillmentModeLabel(mode)}
            </span>
          ))}
          {product.ageGroups?.length ? (
            <span className="rounded-md border border-blue/20 bg-cyan px-2 py-1 text-[11px] font-bold text-primary">
              Ages {product.ageGroups.join(", ")}
            </span>
          ) : null}
        </div>
        <div className="product-card-inventory-price flex items-center justify-between gap-3">
          <p className="product-card-inventory text-xs font-black text-green">{inventoryLabel}</p>
          <p className="product-card-price text-xl font-black text-primary">{product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)}</p>
        </div>
        <div className="product-card-actions flex items-stretch gap-2">
          <div className="product-card-primary-action min-w-0 flex-1">
            {product.previewOnly ? (
              <button
                aria-disabled="true"
                className="flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-pill border border-blue/30 bg-cyan px-4 py-3 text-sm font-black text-primary opacity-75"
                disabled
                title="Checkout is disabled during the read-only Square preview"
                type="button"
              >
                <ShoppingCart aria-hidden="true" size={16} />
                Add to cart
              </button>
            ) : (
              <AddToCartButton disabled={purchaseDisabled} disabledReason={disabledReason} squareVariationId={product.squareVariationId} />
            )}
          </div>
          <WishlistButton className="product-card-wishlist" productName={product.name} squareVariationId={product.squareVariationId} />
        </div>
      </div>
    </article>
  );
}
