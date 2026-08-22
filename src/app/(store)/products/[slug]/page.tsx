/**
 * Renders the products slug page and prepares its route-level data.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/commerce/product-detail";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { StructuredData } from "@/components/seo/structured-data";
import { SectionFrame } from "@/components/sections/section-frame";
import { getProductBySlug } from "@/features/catalog/product-catalog";
import { buildStorefrontMetadata, createProductStructuredData } from "@/lib/seo/storefront-seo";
import { readPublishedStorefrontCmsDocument } from "@/server/storefront/published-cms-document";
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
    description: product.seoDescription || product.shortDescription,
    image: product.imageUrl,
    title: product.seoTitle || `${product.name} | Modern State - State News NYC`
  });
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const squareCatalog = await readResolvedSquareWebsiteCatalog();
  const product = squareCatalog
    ? squareCatalog.catalog.products.find((candidate) => candidate.slug === slug)
    : process.env.E2E_CATALOG_FIXTURE === "true"
      ? getProductBySlug(slug)
      : null;
  const publishedDocument = await readPublishedStorefrontCmsDocument({ entityType: "product", entityId: slug });

  if (!product) {
    notFound();
  }

  if (publishedDocument) {
    return <><StructuredData data={createProductStructuredData(product)} /><StorefrontCmsPage document={publishedDocument} product={product} /></>;
  }

  return (
    <><StructuredData data={createProductStructuredData(product)} /><main className="bg-surface">
      <SectionFrame area="Products" className="py-6 md:py-10" component="ProductDetailSection" sectionId="products.detail" variant="product-detail">
        <ProductDetail product={product} />
      </SectionFrame>
    </main></>
  );
}

async function readPublicProduct(slug: string) {
  const squareCatalog = await readResolvedSquareWebsiteCatalog();
  return squareCatalog
    ? squareCatalog.catalog.products.find((product) => product.slug === slug)
    : process.env.E2E_CATALOG_FIXTURE === "true"
      ? getProductBySlug(slug)
      : null;
}
