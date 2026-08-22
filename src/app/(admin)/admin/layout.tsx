/**
 * Defines the shared layout and providers for the admin route area.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/server/admin/admin-session";
import { isStorefrontAdminPreviewEnabled } from "@/server/storefront/admin-preview";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();
  return <AdminShell adminPreview={isStorefrontAdminPreviewEnabled()} capabilities={session.capabilities}>{children}</AdminShell>;
}
