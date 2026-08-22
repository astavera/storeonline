/**
 * Renders the admin holidays id page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function AdminHolidayDetailPage() {
  redirect("/admin/products?tab=publishing");
}
