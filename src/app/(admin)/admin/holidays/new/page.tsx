/**
 * Renders the admin holidays new page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function AdminNewHolidayPage() {
  redirect("/admin/products?tab=publishing");
}
