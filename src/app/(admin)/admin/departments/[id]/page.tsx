/**
 * Renders the admin departments id page and prepares its route-level data.
 */

import { AdminPageShell } from "@/components/admin/admin-page-shell";

export default async function AdminDepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminPageShell description={`Department ${id} editor for copy, SEO, visibility, product assignments, and accents.`} sectionId="admin.departments" title="Department detail" />;
}
