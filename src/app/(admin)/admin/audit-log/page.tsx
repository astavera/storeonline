/**
 * Renders the admin audit log page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default function AdminAuditLogPage() {
  return <AdminPageShell description="Every admin change to content, zones, slots, fulfillment, product overrides, and theme settings is audit logged." sectionId="admin.fulfillment-dashboard" title="Audit log" />;
}
