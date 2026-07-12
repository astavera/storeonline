import { DepartmentPageTemplate } from "@/components/templates/department-page-template";

export const metadata = {
  title: "Greeting Cards",
  description: "Shop greeting cards for birthdays, thank-you notes, invitations, holidays, and everyday moments."
};

export default function GreetingCardsPage() {
  return <DepartmentPageTemplate slug="greeting-cards" />;
}
