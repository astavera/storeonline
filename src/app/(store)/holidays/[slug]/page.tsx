import { HolidayDetailTemplate } from "@/components/templates/holidays-page-template";
import { holidays } from "@/config/holidays.config";

export function generateStaticParams() {
  return holidays.map((holiday) => ({ slug: holiday.slug }));
}

export default async function HolidayDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <HolidayDetailTemplate slug={slug} />;
}
