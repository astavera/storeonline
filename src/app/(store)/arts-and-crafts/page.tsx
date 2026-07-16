import { DepartmentPageTemplate } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Arts & Crafts",
  description: "Shop arts and crafts supplies, creative kits, paints, brushes, canvases, and project materials."
};

export default function ArtsAndCraftsPage() {
  return <DepartmentPageTemplate slug="arts-and-crafts" />;
}
