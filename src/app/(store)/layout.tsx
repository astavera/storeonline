import type { ReactNode } from "react";
import { StoreShell } from "@/components/layout/store-shell";
import { StructuredData } from "@/components/seo/structured-data";
import { createStorefrontOrganizationSchema } from "@/lib/seo/storefront-seo";

export const dynamic = "force-dynamic";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StructuredData data={createStorefrontOrganizationSchema()} />
      <StoreShell>{children}</StoreShell>
    </>
  );
}
