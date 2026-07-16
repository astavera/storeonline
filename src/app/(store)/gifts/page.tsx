import { DepartmentPageTemplate } from "@/components/templates/department-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Gifts",
  description: "Shop gifts, gift wrap, frames, photo albums, candles, and local favorites."
};

export default function GiftsPage() {
  return <DepartmentPageTemplate slug="gifts" />;
}
