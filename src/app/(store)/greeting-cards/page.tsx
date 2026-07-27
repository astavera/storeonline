import { DepartmentPageTemplate, getDepartmentPageMetadata } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const generateMetadata = () => getDepartmentPageMetadata("greeting-cards");

export default function GreetingCardsPage() {
  return <DepartmentPageTemplate slug="greeting-cards" />;
}
