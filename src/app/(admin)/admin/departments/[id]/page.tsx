/**
 * Renders the admin departments id page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function AdminDepartmentDetailPage() {
  redirect("/admin/products?tab=publishing");
}
