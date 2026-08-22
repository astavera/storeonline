/**
 * Renders the default storefront product detail when no CMS document is published.
 */

import { MapPin, PackageCheck, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { formatMoney } from "@/lib/utils";
import { AddToCartButton } from "./add-to-cart-button";
import { PickupLocationInventory } from "./pickup-location-inventory";
import { WishlistButton } from "./wishlist-button";

export function ProductDetail({ product }: { product: StorefrontProduct }) {
  const purchaseDisabled = product.inventoryStatus === "out-of-stock" || product.priceAvailable === false;
  const secondaryDescription = product.description.trim() !== product.shortDescription.trim()
    ? product.description
    : "";

  return (
    <div className="mx-auto w-[calc(100%_-_2rem)] max-w-[1440px]" data-store-component="ProductDetail">
      <nav aria-label="Breadcrumb" className="mb-6 overflow-x-auto whitespace-nowrap text-sm text-secondary md:mb-8">
        <Link className="transition hover:text-primary" href="/">Home</Link>
        <span aria-hidden="true" className="mx-2">/</span>
        <Link className="transition hover:text-primary" href="/shop">Shop</Link>
        <span aria-hidden="true" className="mx-2">/</span>
        <span aria-current="page" className="text-primary">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] lg:gap-14 xl:gap-20">
        <div className="self-start overflow-hidden border border-border bg-surface-muted">
          <Image
            alt={product.imageAlt || product.name}
            className="aspect-square h-auto w-full object-contain"
            height={1100}
            priority
            src={product.imageUrl}
            unoptimized
            width={1100}
          />
        </div>

        <article className="min-w-0 lg:pt-2">
          <header className="border-b border-border pb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue">{product.department}</p>
                <h1 className="mt-3 font-display text-4xl font-black leading-[1.03] tracking-[-0.035em] text-primary sm:text-5xl">
                  {product.name}
                </h1>
              </div>
              <WishlistButton className="mt-1" productName={product.name} squareVariationId={product.squareVariationId} />
            </div>
            {product.shortDescription ? <p className="mt-5 max-w-2xl text-base leading-7 text-secondary md:text-lg">{product.shortDescription}</p> : null}
          </header>

          <section aria-label="Price and availability" className="border-b border-border py-6">
            <p className="font-display text-3xl font-black tracking-[-0.025em] text-primary">
              {product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)}
            </p>
            <p className={`mt-3 flex items-center gap-2 text-sm font-bold ${inventoryTextClass(product.inventoryStatus)}`}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
              {inventoryStatusLabel(product.inventoryStatus)}
            </p>
          </section>

          <section aria-labelledby="fulfillment-heading" className="border-b border-border py-6">
            <h2 className="font-display text-lg font-black text-primary" id="fulfillment-heading">Ways to receive it</h2>
            <div className="mt-4 grid gap-4">
              {product.fulfillmentModes.map((mode) => (
                <FulfillmentRow key={mode} mode={mode} />
              ))}
            </div>
          </section>

          <PickupLocationInventory product={product} />

          <section aria-label="Purchase options" className="py-6">
            {product.previewOnly ? (
              <div className="border-y border-border py-4 text-sm font-bold text-secondary">Purchasing is unavailable for this Square preview.</div>
            ) : (
              <AddToCartButton
                disabled={purchaseDisabled}
                disabledReason={product.priceAvailable === false ? "Price unavailable" : "Out of stock"}
                showQuantitySelector
                squareVariationId={product.squareVariationId}
              />
            )}
            <p className="mt-3 text-center text-xs leading-5 text-secondary">Price and availability are confirmed before checkout.</p>
          </section>

          {secondaryDescription ? (
            <section aria-labelledby="product-details-heading" className="border-t border-border py-6">
              <h2 className="font-display text-lg font-black text-primary" id="product-details-heading">Product details</h2>
              <p className="mt-3 text-sm leading-6 text-secondary">{secondaryDescription}</p>
            </section>
          ) : null}
        </article>
      </div>
    </div>
  );
}

function FulfillmentRow({ mode }: { mode: StorefrontProduct["fulfillmentModes"][number] }) {
  const content: Record<typeof mode, { description: string; icon: ReactNode; label: string }> = {
    pickup: {
      description: "Choose a store and pickup time during checkout.",
      icon: <MapPin aria-hidden="true" size={19} strokeWidth={1.8} />,
      label: "Store pickup"
    },
    "local-delivery": {
      description: "Enter your address during checkout to confirm eligibility.",
      icon: <Truck aria-hidden="true" size={19} strokeWidth={1.8} />,
      label: "Local delivery"
    },
    shipping: {
      description: "Shipping options are confirmed during checkout.",
      icon: <PackageCheck aria-hidden="true" size={19} strokeWidth={1.8} />,
      label: "Shipping"
    }
  };
  const item = content[mode];

  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
      <span className="pt-0.5 text-secondary">{item.icon}</span>
      <div>
        <p className="text-sm font-black text-primary">{item.label}</p>
        <p className="mt-1 text-sm leading-5 text-secondary">{item.description}</p>
      </div>
    </div>
  );
}

function inventoryStatusLabel(status: StorefrontProduct["inventoryStatus"]) {
  if (status === "limited") return "Limited availability";
  if (status === "special-order") return "Available by special order";
  if (status === "out-of-stock") return "Out of stock";
  return "In stock";
}

function inventoryTextClass(status: StorefrontProduct["inventoryStatus"]) {
  if (status === "in-stock") return "text-green";
  if (status === "out-of-stock") return "text-secondary";
  return "text-primary";
}
