import { DepartmentPageTemplate } from "@/components/templates/department-page-template";

export const metadata = {
  title: "Toys",
  description: "Shop toys, games, building sets, dolls, plush, puzzles, and creative play favorites."
};

export default function ToysPage() {
  return <DepartmentPageTemplate slug="toys" />;
}
