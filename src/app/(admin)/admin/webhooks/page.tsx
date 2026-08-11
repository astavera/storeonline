/**
 * Renders the admin webhooks page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default function AdminWebhooksPage() {
  return <AdminPageShell description="Square webhook events, signature validation status, replay protection, and processing state." sectionId="admin.fulfillment-dashboard" title="Webhooks" />;
}
