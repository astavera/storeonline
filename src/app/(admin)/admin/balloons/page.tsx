/**
 * Renders the admin balloons page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function AdminBalloonsPage() {
  redirect("/admin/products?tab=publishing");
}
