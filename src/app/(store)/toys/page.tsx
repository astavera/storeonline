/**
 * Renders the toys page and prepares its route-level data.
 */

import { DepartmentPageTemplate, getDepartmentPageMetadata } from "@/components/templates/department-page-template";
import { StructuredData } from "@/components/seo/structured-data";
import { createBreadcrumbStructuredData } from "@/lib/seo/storefront-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const generateMetadata = () => getDepartmentPageMetadata("toys");

type ToysPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ToysPage({ searchParams }: ToysPageProps) {
  return <><StructuredData data={createBreadcrumbStructuredData([{ name: "Home", path: "/" }, { name: "Toys", path: "/toys" }])} /><DepartmentPageTemplate searchParams={await searchParams} slug="toys" /></>;
}
