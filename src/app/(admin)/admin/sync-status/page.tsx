/**
 * Renders the admin sync status page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default function AdminSyncStatusPage() {
  return <AdminPageShell description="Square catalog, inventory, image, location, tax, order, and payment synchronization visibility." sectionId="admin.fulfillment-dashboard" title="Sync status" />;
}
