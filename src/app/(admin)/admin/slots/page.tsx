/**
 * Renders the admin slots page and prepares its route-level data.
 */

import { OrderProManagedPanel } from "@/components/admin/orderpro-managed-panel";

export default function AdminSlotsPage() {
  return <OrderProManagedPanel description="Available pickup and local-delivery dates and time slots come from OrderPro." title="Pickup and delivery slots" />;
}
