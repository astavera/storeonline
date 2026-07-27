import { DepartmentPageTemplate, getDepartmentPageMetadata } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const generateMetadata = () => getDepartmentPageMetadata("stationery");

export default function StationeryPage() {
  return <DepartmentPageTemplate slug="stationery" />;
}
