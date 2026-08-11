/**
 * Renders the admin delivery zones page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default function AdminDeliveryZonesPage() {
  return <AdminPageShell description="Map-based local delivery zones stored as versioned GeoJSON/PostGIS polygons with audited fees and cutoffs." sectionId="admin.delivery-zones" title="Delivery zones" />;
}
