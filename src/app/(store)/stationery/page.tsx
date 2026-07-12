import { DepartmentPageTemplate } from "@/components/templates/department-page-template";

export const metadata = {
  title: "Stationery",
  description: "Shop stationery, school supplies, planners, paper, pens, pencils, folders, and desk essentials."
};

export default function StationeryPage() {
  return <DepartmentPageTemplate slug="stationery" />;
}
