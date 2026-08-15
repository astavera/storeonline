/**
 * Renders the party supplies page and prepares its route-level data.
 */

import { DepartmentPageTemplate, getDepartmentPageMetadata } from "@/components/templates/department-page-template";
import { StructuredData } from "@/components/seo/structured-data";
import { createBreadcrumbStructuredData } from "@/lib/seo/storefront-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const generateMetadata = () => getDepartmentPageMetadata("party-supplies");

type PartySuppliesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PartySuppliesPage({ searchParams }: PartySuppliesPageProps) {
  return <><StructuredData data={createBreadcrumbStructuredData([{ name: "Home", path: "/" }, { name: "Party Supplies", path: "/party-supplies" }])} /><DepartmentPageTemplate searchParams={await searchParams} slug="party-supplies" /></>;
}
