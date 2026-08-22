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
import {
  storefrontFulfillableQuantity,
  storefrontInventoryLabel,
  type FulfillmentMode,
  type ProductAgeGroup
} from "@/features/catalog/product-catalog";
import { cn, formatMoney } from "@/lib/utils";
import Image from "next/image";
import { AddToCartButton } from "./add-to-cart-button";
import { WishlistButton } from "./wishlist-button";

export type ProductCardData = {
  squareVariationId: string;
  slug: string;
  name: string;
  department: string;
  shortDescription: string;
  imageUrl: string;
  imageAlt?: string;
  priceCents: number;
  badge?: string;
  fulfillmentModes: FulfillmentMode[];
  inventoryStatus: "in-stock" | "limited" | "special-order" | "out-of-stock";
  inventoryTracked?: boolean;
  availableQuantity?: number | null;
  fulfillableQuantity?: number | null;
  priceAvailable?: boolean;
  ageGroups?: ProductAgeGroup[];
  previewOnly?: boolean;
};

export function ProductCard({
  product,
  showQuantitySelector = true,
  variant = "premium"
}: {
  product: ProductCardData;
  showQuantitySelector?: boolean;
  variant?: ProductCardVariant;
}) {
  const productImage = product.imageUrl || "/images/product-fallback.svg";
  const maxQuantity = storefrontFulfillableQuantity(product);
  const inventoryLabel = storefrontInventoryLabel(product);
  const purchaseDisabled = product.previewOnly || product.inventoryStatus === "out-of-stock" || maxQuantity === 0 || product.priceAvailable === false;
  const disabledReason = product.previewOnly ? "Unavailable online" : product.priceAvailable === false ? "Price unavailable" : "Out of stock";
  const productImageElement = (
    <span className="product-card-image-frame">
      <Image
        alt={product.imageAlt || product.name}
        className="product-card-image object-contain"
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
        src={productImage}
        unoptimized
      />
    </span>
  );

  return (
    <article className={cn("storefront-product-card group relative flex min-h-[470px] flex-col overflow-hidden rounded-md bg-surface", cardPresets[variant])} data-cms-edit-field="linkedProduct" data-inventory-status={product.inventoryStatus} data-product-slug={product.slug} data-store-component="ProductCard" data-store-variant={variant}>
      {product.badge ? <span className="absolute left-3 top-3 z-10 rounded-pill bg-blue px-2.5 py-1 text-xs font-black text-white" data-cms-edit-field="productBadge">{product.badge}</span> : null}
      {product.previewOnly ? (
        <div className="product-card-media block aspect-square bg-white p-6">{productImageElement}</div>
      ) : (
        <a className="product-card-media block aspect-square bg-white p-6" href={`/products/${product.slug}`}>
          {productImageElement}
        </a>
      )}
      <div className="product-card-content flex flex-1 flex-col gap-3 p-4">
        <div className="product-card-title-wrap flex-1">
          <h3 className="font-display text-base font-black leading-snug" data-cms-edit-field="productTitle">
            {product.previewOnly ? product.name : (
              <a className="hover:text-blue" href={`/products/${product.slug}`}>
                {product.name}
              </a>
            )}
          </h3>
        </div>
        <p className={cn("product-card-stock text-[11px] font-bold leading-none", product.inventoryStatus === "out-of-stock" ? "text-secondary" : maxQuantity !== null && maxQuantity <= 3 ? "text-red" : "text-green")}>
          {inventoryLabel}
        </p>
        <p className="product-card-price text-xl font-black text-primary">{product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)}</p>
        <div className="product-card-actions flex items-stretch gap-2">
          <div className="product-card-primary-action min-w-0 flex-1">
            <AddToCartButton
              disabled={purchaseDisabled}
              disabledReason={disabledReason}
              maxQuantity={maxQuantity}
              showQuantitySelector={showQuantitySelector}
              squareVariationId={product.squareVariationId}
            />
          </div>
          <WishlistButton className="product-card-wishlist" productName={product.name} squareVariationId={product.squareVariationId} />
        </div>
      </div>
    </article>
  );
}
