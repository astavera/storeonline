import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/commerce/add-to-cart-button";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { SectionFrame } from "@/components/sections/section-frame";
import { fulfillmentModeLabel, getProductBySlug, storefrontProducts } from "@/features/catalog/product-catalog";
import { formatMoney } from "@/lib/utils";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";

export function generateStaticParams() {
  return storefrontProducts.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    return {
      title: "Product not found"
    };
  }

  return {
    title: product.name,
    description: product.shortDescription,
    openGraph: {
      title: product.name,
      description: product.shortDescription,
      images: [{ url: product.imageUrl }]
    }
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const publishedDocument = await readLatestCmsDocument({ entityType: "product", entityId: slug, statuses: ["PUBLISHED"] });

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const product = getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return (
    <main>
      <SectionFrame area="Products" className="py-16" component="ProductDetailSection" sectionId="products.detail" variant="product-detail">
        <div className="container-shell grid gap-10 lg:grid-cols-[0.9fr_1fr] lg:items-start">
          <div className="overflow-hidden rounded-md border border-border bg-surface-muted">
            <img alt={product.name} className="aspect-[4/3] h-full w-full object-cover" src={product.imageUrl} />
          </div>
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">{product.department}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight">{product.name}</h1>
            <p className="mt-4 max-w-2xl text-lg text-secondary">{product.description}</p>
            <p className="mt-6 text-2xl font-semibold">{formatMoney(product.priceCents)}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {product.fulfillmentModes.map((mode) => (
                <span className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-semibold text-secondary" key={mode}>
                  {fulfillmentModeLabel(mode)}
                </span>
              ))}
            </div>
            <div className="mt-8 max-w-sm">
              <AddToCartButton squareVariationId={product.squareVariationId} />
            </div>
            <div className="mt-8 grid gap-3 rounded-md border border-border bg-surface-muted p-4 text-sm text-secondary">
              <p><span className="font-semibold text-primary">Availability:</span> {inventoryLabel(product.inventoryStatus)}</p>
              <p><span className="font-semibold text-primary">Payment:</span> Square checkout validates price, fulfillment, and tax before payment capture.</p>
            </div>
          </section>
        </div>
      </SectionFrame>
    </main>
  );
}

function inventoryLabel(status: "in-stock" | "limited" | "special-order") {
  if (status === "limited") {
    return "Limited quantities available";
  }

  if (status === "special-order") {
    return "Special order";
  }

  return "In stock";
}
