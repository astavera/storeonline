/**
 * Renders the holidays page and prepares its route-level data.
 */

import { HolidaysIndexTemplate } from "@/components/templates/holidays-page-template";
import { StructuredData } from "@/components/seo/structured-data";
import { buildStorefrontMetadata, createBreadcrumbStructuredData } from "@/lib/seo/storefront-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildStorefrontMetadata({
  canonicalPath: "/holidays",
  description: "Shop Modern State seasonal gifts, party supplies, cards, decorations, and active holiday favorites.",
  title: "Holidays | Modern State - State News NYC"
});

type HolidaysPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HolidaysPage({ searchParams }: HolidaysPageProps) {
  return <><StructuredData data={createBreadcrumbStructuredData([{ name: "Home", path: "/" }, { name: "Holidays", path: "/holidays" }])} /><HolidaysIndexTemplate searchParams={await searchParams} /></>;
}
