/**
 * Renders the gifts page and prepares its route-level data.
 */

import { DepartmentPageTemplate, getDepartmentPageMetadata } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const generateMetadata = () => getDepartmentPageMetadata("gifts");

export default function GiftsPage() {
  return <DepartmentPageTemplate slug="gifts" />;
}
