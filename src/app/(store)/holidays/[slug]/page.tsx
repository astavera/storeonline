/**
 * Renders the holidays slug page and prepares its route-level data.
 */

import { HolidayDetailTemplate } from "@/components/templates/holidays-page-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HolidayDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <HolidayDetailTemplate slug={slug} />;
}
