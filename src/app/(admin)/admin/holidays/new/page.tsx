/**
 * Renders the admin holidays new page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default function AdminNewHolidayPage() {
  return <AdminPageShell description="Create a holiday with controlled fields, validation, and audit logging." sectionId="admin.holidays" title="New holiday" />;
}
