import { DepartmentPageTemplate, getDepartmentPageMetadata } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const generateMetadata = () => getDepartmentPageMetadata("party-supplies");

export default function PartySuppliesPage() {
  return <DepartmentPageTemplate slug="party-supplies" />;
}
