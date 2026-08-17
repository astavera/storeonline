/**
 * Renders the admin page and prepares its route-level data.
 */

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { redirect } from "next/navigation";
import { isStorefrontAdminPreviewEnabled } from "@/server/storefront/admin-preview";

export default function AdminDashboardPage() {
  if (isStorefrontAdminPreviewEnabled()) {
    redirect("/admin/homepage");
  }

  return <AdminDashboard />;
}
