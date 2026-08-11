/**
 * Renders the admin shipping page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default function AdminShippingPage() {
  return <AdminPageShell description="Warehouse shipping settings, Shippo abstraction, label workflow, and future FedEx/UPS direct integrations." sectionId="admin.fulfillment-dashboard" title="Shipping" />;
}
