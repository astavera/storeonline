/**
 * Renders the admin fulfillment page and prepares its route-level data.
 */

import { OrderProManagedPanel } from "@/components/admin/orderpro-managed-panel";

export default function AdminFulfillmentPage() {
  return <OrderProManagedPanel description="Pickup, balloon preparation, delivery queues and status transitions are managed in OrderPro." title="Fulfillment" />;
}
