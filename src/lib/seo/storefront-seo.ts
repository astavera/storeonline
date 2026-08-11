/**
 * Provides shared storefront SEO types and utilities for the application.
 */

import type { Metadata } from "next";
import { storeLocations } from "@/config/locations.config";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

const businessName = "Modern State - State News NYC";

export const storefrontStaticPaths = [
  "/",
  "/shop",
  "/search",
  "/toys",
  "/party-supplies",
  "/balloons",
  "/stationery",
  "/arts-and-crafts",
  "/greeting-cards",
  "/gifts",
  "/holidays",
  "/locations",
  "/about",
  "/contact",
  "/pickup-policy",
  "/local-delivery-policy",
  "/return-policy",
  "/privacy-policy",
  "/terms",
  "/security"
] as const;

export function absoluteStorefrontUrl(pathname = "/") {
  const baseUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  if (/^https?:\/\//i.test(pathname)) return new URL(pathname).toString();
  return new URL(pathname.startsWith("/") ? pathname : `/${pathname}`, baseUrl).toString();
}

export function storefrontIsIndexable() {
  return process.env.NEXT_PUBLIC_SITE_INDEXABLE === "true";
}

export function buildStorefrontMetadata({
  canonicalPath,
  description,
  image,
  indexable = true,
  title
}: {
  canonicalPath: string;
  description: string;
  image?: string;
  indexable?: boolean;
  title: string;
}): Metadata {
  const canonicalUrl = absoluteStorefrontUrl(canonicalPath);
  const shouldIndex = storefrontIsIndexable() && indexable;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "website",
      siteName: businessName,
      title,
      description,
      url: canonicalUrl,
      images: image ? [{ url: absoluteStorefrontUrl(image) }] : undefined
    },
    robots: {
      index: shouldIndex,
      follow: shouldIndex
    }
  };
}

export function createStorefrontOrganizationSchema() {
  const organizationId = `${absoluteStorefrontUrl("/")}#organization`;
  const publicLocations = storeLocations.filter((location) => location.slug !== "warehouse");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: businessName,
        alternateName: "State News NYC",
        url: absoluteStorefrontUrl("/"),
        logo: absoluteStorefrontUrl("/images/modern-state-logo-original.png"),
        telephone: publicLocations[0]?.phone
      },
      ...publicLocations.map((location) => ({
        "@type": "Store",
        "@id": `${absoluteStorefrontUrl(`/locations/${location.slug}`)}#store`,
        name: `${businessName} - ${location.name}`,
        url: absoluteStorefrontUrl(`/locations/${location.slug}`),
        parentOrganization: { "@id": organizationId },
        address: {
          "@type": "PostalAddress",
          streetAddress: location.address,
          addressLocality: "New York",
          addressRegion: "NY",
          addressCountry: "US"
        },
        telephone: location.phone,
        openingHours: "Mo-Su 10:00-19:00"
      }))
    ]
  };
}

export function createProductStructuredData(product: StorefrontProduct) {
  const availability = product.inventoryStatus === "out-of-stock"
    ? "https://schema.org/OutOfStock"
    : product.inventoryStatus === "special-order"
      ? "https://schema.org/PreOrder"
      : "https://schema.org/InStock";
  const productUrl = absoluteStorefrontUrl(`/products/${product.slug}`);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    description: product.shortDescription || product.description,
    image: [absoluteStorefrontUrl(product.imageUrl)],
    category: product.department,
    sku: product.squareVariationId,
    url: productUrl,
    offers: product.priceAvailable === false || product.previewOnly
      ? undefined
      : {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "USD",
          price: (product.priceCents / 100).toFixed(2),
          availability,
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@id": `${absoluteStorefrontUrl("/")}#organization` }
        }
  };
}

export function createBreadcrumbStructuredData(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      item: absoluteStorefrontUrl(item.path),
      name: item.name,
      position: index + 1
    }))
  };
}
