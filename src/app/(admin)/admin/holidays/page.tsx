/**
 * Renders the admin holidays page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function AdminHolidaysPage() {
  redirect("/admin/products?tab=publishing");
}
