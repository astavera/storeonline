/**
 * Renders the admin holidays id page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default async function AdminHolidayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminPageShell description={`Holiday ${id} editor for active dates, hero content, products, SEO, and accent settings.`} sectionId="admin.holidays" title="Holiday detail" />;
}
