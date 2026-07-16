import { DepartmentPageTemplate } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Party Supplies",
  description: "Shop party supplies, tableware, decorations, invitations, gift wrap, and event essentials."
};

export default function PartySuppliesPage() {
  return <DepartmentPageTemplate slug="party-supplies" />;
}
