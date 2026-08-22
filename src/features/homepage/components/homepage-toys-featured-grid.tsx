/**
 * Renders a compact four-by-two grid of admin-selected featured toy products.
 */

import Image from "next/image";
import Link from "next/link";

import { AddToCartButton } from "@/components/commerce/add-to-cart-button";
import { WishlistButton } from "@/components/commerce/wishlist-button";
import {
  storefrontFulfillableQuantity,
  storefrontInventoryLabel,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

export function HomepageToysFeaturedGrid({
  products,
  section
}: {
  products: StorefrontProduct[];
  section?: HomepageSectionConfig;
}) {
  if (products.length === 0) {
    return null;
  }

  const title = section?.title?.trim() || "Featured toys";

  return (
    <section
      className="flex min-w-0 flex-col"
      data-store-section={section?.sectionId ?? "home.toys-featured-products"}
    >
      <h2 className="font-display text-2xl font-black text-[#062c68] sm:text-3xl">
        {title}
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:flex-1 lg:grid-cols-4 lg:grid-rows-2">
        {products.slice(0, 8).map((product) => {
          const maxQuantity = storefrontFulfillableQuantity(product);
          const purchaseDisabled =
            product.previewOnly ||
            product.inventoryStatus === "out-of-stock" ||
            maxQuantity === 0 ||
            product.priceAvailable === false;
          const disabledReason = product.previewOnly
            ? "Preview only"
            : product.priceAvailable === false
              ? "Price unavailable"
              : "Out of stock";

          return (
          <article
            className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[18px] border border-black/[0.08] bg-white transition hover:-translate-y-0.5 hover:border-[#155bc2]/30"
            data-store-component="ProductCard"
            key={product.squareVariationId}
          >
            <Link href={`/products/${product.slug}`}>
              <div className="relative h-36 overflow-hidden bg-white sm:h-40 lg:h-48 xl:h-52">
                <Image
                  alt={product.name}
                  className="object-contain p-1.5 transition duration-300 group-hover:scale-[1.025]"
                  fill
                  sizes="(max-width: 640px) 42vw, (max-width: 1024px) 28vw, 18vw"
                  src={product.imageUrl}
                  unoptimized
                />
              </div>
            </Link>
            <div className="flex flex-1 flex-col border-t border-black/[0.06] p-2">
              <h3 className="line-clamp-2 min-h-8 text-[11px] font-black leading-snug text-[#062c68] sm:text-xs">
                <Link className="hover:text-[#155bc2]" href={`/products/${product.slug}`}>
                  {product.name}
                </Link>
              </h3>
              <p className={`mt-1 text-[10px] font-bold leading-tight ${product.inventoryStatus === "out-of-stock" ? "text-secondary" : maxQuantity !== null && maxQuantity <= 3 ? "text-red" : "text-green"}`}>
                {storefrontInventoryLabel(product)}
              </p>
              <div className="mt-auto flex items-stretch gap-1.5 pt-1.5">
                <div className="min-w-0 flex-1 [&_button]:!min-h-8 [&_button]:!py-1.5 [&_button]:!text-[11px]">
                  <AddToCartButton
                    disabled={purchaseDisabled}
                    disabledReason={disabledReason}
                    label="Add to cart"
                    maxQuantity={maxQuantity}
                    squareVariationId={product.squareVariationId}
                  />
                </div>
                <WishlistButton
                  className="!min-h-8 !w-9 !rounded-full"
                  productName={product.name}
                  squareVariationId={product.squareVariationId}
                />
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
