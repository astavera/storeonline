import type { Metadata } from "next";
import { HomePageTemplate } from "@/components/templates/home-page-template";
import { getPublishedHomepageSections, getPublishedHomepageState } from "@/features/admin/services/homepage-visual-editor-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const homepageState = await getPublishedHomepageState();
  const seo = homepageState.seo;

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
      index: seo.indexable,
      follow: seo.indexable
    }
  };
}

export default async function HomePage() {
  const homepageSections = await getPublishedHomepageSections();

  return <HomePageTemplate sections={homepageSections} />;
}
