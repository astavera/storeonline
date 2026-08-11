/**
 * Renders the products slug page and prepares its route-level data.
 */

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/commerce/add-to-cart-button";
import { PickupLocationInventory } from "@/components/commerce/pickup-location-inventory";
import { WishlistButton } from "@/components/commerce/wishlist-button";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { StructuredData } from "@/components/seo/structured-data";
import { SectionFrame } from "@/components/sections/section-frame";
import { fulfillmentModeLabel, getProductBySlug } from "@/features/catalog/product-catalog";
import { formatMoney } from "@/lib/utils";
import { buildStorefrontMetadata, createProductStructuredData } from "@/lib/seo/storefront-seo";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await readPublicProduct(slug);

  if (!product) {
    return buildStorefrontMetadata({
      canonicalPath: `/products/${slug}`,
      description: "The requested Modern State product could not be found.",
      indexable: false,
      title: "Product not found | Modern State - State News NYC"
    });
  }

  return buildStorefrontMetadata({
    canonicalPath: `/products/${product.slug}`,
    description: product.shortDescription,
    image: product.imageUrl,
    title: `${product.name} | Modern State - State News NYC`
  });
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const squareCatalog = await readResolvedSquareWebsiteCatalog();
  const product = squareCatalog ? squareCatalog.catalog.products.find((candidate) => candidate.slug === slug) : getProductBySlug(slug);
  const publishedDocument = await readLatestCmsDocument({ entityType: "product", entityId: slug, statuses: ["PUBLISHED"] });

  if (!product) {
    notFound();
  }

  if (publishedDocument) {
    return <><StructuredData data={createProductStructuredData(product)} /><StorefrontCmsPage document={publishedDocument} product={product} /></>;
  }

  return (
    <><StructuredData data={createProductStructuredData(product)} /><main>
      <SectionFrame area="Products" className="py-16" component="ProductDetailSection" sectionId="products.detail" variant="product-detail">
        <div className="container-shell grid gap-10 lg:grid-cols-[0.9fr_1fr] lg:items-start">
          <div className="overflow-hidden rounded-md border border-border bg-surface-muted">
            <Image alt={product.name} className="aspect-[4/3] h-full w-full object-cover" height={900} src={product.imageUrl} unoptimized width={1200} />
          </div>
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">{product.department}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight">{product.name}</h1>
            <p className="mt-4 max-w-2xl text-lg text-secondary">{product.description}</p>
            <p className="mt-6 text-2xl font-semibold">{product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {product.fulfillmentModes.map((mode) => (
                <span className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-semibold text-secondary" key={mode}>
                  {fulfillmentModeLabel(mode)}
                </span>
              ))}
            </div>
            <PickupLocationInventory product={product} />
            <div className="mt-8 flex max-w-sm items-stretch gap-2">
              <div className="min-w-0 flex-1">
                {product.previewOnly ? <div className="rounded-pill border border-blue/30 bg-cyan px-5 py-3 text-center font-black text-primary">Read-only Square preview</div> : <AddToCartButton disabled={product.inventoryStatus === "out-of-stock" || product.priceAvailable === false} disabledReason={product.priceAvailable === false ? "Price unavailable" : "Out of stock"} showQuantitySelector squareVariationId={product.squareVariationId} />}
              </div>
              <WishlistButton productName={product.name} squareVariationId={product.squareVariationId} />
            </div>
          </section>
        </div>
      </SectionFrame>
    </main></>
  );
}

async function readPublicProduct(slug: string) {
  const squareCatalog = await readResolvedSquareWebsiteCatalog();
  return squareCatalog ? squareCatalog.catalog.products.find((product) => product.slug === slug) : getProductBySlug(slug);
}
