/**
 * Renders the admin theme page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default function AdminThemePage() {
  return <AdminPageShell description="Controlled theme presets and token-backed color settings. Arbitrary CSS editing is intentionally excluded." sectionId="admin.homepage-sections" title="Theme" />;
}
