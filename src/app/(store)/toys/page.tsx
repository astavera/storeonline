import { DepartmentPageTemplate, getDepartmentPageMetadata } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const generateMetadata = () => getDepartmentPageMetadata("toys");

export default function ToysPage() {
  return <DepartmentPageTemplate slug="toys" />;
}
