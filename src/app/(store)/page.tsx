/**
 * Renders the storefront homepage page and prepares its route-level data.
 */

import type { Metadata } from "next";
import { HomePageTemplate } from "@/features/homepage";
import { getPublishedHomepageSections, getPublishedHomepageState, resolveHomepageStorefrontContent } from "@/features/homepage/server";
import { storefrontIsIndexable } from "@/lib/seo/storefront-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const homepageState = await getPublishedHomepageState();
  const seo = homepageState.seo;
  const indexable = storefrontIsIndexable() && seo.indexable;

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: seo.canonicalUrl
    },
    openGraph: {
      title: seo.ogTitle,
      description: seo.ogDescription,
      images: seo.ogImage ? [{ url: seo.ogImage }] : undefined
    },
    robots: {
      index: indexable,
      follow: indexable
    }
  };
}

export default async function HomePage() {
  const homepageSections = await getPublishedHomepageSections();
  const { categories, products, trendingProducts } =
    await resolveHomepageStorefrontContent();

  return (
    <HomePageTemplate
      categories={categories}
      products={products}
      sections={homepageSections}
      trendingProducts={trendingProducts}
    />
  );
}
