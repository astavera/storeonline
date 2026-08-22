/**
 * Renders the admin theme page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function AdminThemePage() {
  redirect("/admin/storefront-pages");
}
