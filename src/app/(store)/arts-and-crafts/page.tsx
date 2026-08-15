/**
 * Renders the arts and crafts page and prepares its route-level data.
 */

import { DepartmentPageTemplate, getDepartmentPageMetadata } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const generateMetadata = () => getDepartmentPageMetadata("arts-and-crafts");

export default function ArtsAndCraftsPage() {
  return <DepartmentPageTemplate slug="arts-and-crafts" />;
}
