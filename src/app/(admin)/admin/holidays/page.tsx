/**
 * Renders the admin holidays page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default function AdminHolidaysPage() {
  return <AdminPageShell description="Manage editable holiday campaigns, dates, SEO, visibility, accents, and product assignments." sectionId="admin.holidays" title="Holidays" />;
}
