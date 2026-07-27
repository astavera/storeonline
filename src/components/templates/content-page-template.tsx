/*
STORE AREA: Storefront Content
SECTION: Content Page Template
SECTION ID: content.*
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Static informational pages such as About, Contact, Search, Products, and policies.
SAFE TO EDIT: Informational page copy and token-based layout.
DO NOT EDIT HERE: Checkout validation, payment handling, Square writes, or admin auth.
RELATED FILES: src/config/locations.config.ts, src/config/storefront-pages.config.ts
BUSINESS LOGIC FILES: none
*/

import { SectionFrame } from "../sections/section-frame";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import type { CmsEntityType } from "@/lib/cms";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";

export async function ContentPageTemplate({
  area,
  sectionId,
  title,
  body,
  children
}: {
  area: string;
  sectionId: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const entityType = entityTypeForContentPage(area, sectionId);
  const entityId = entityIdForContentPage(sectionId);
  const publishedDocument = await readLatestCmsDocument({ entityType, entityId, statuses: ["PUBLISHED"] });

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  return (
    <main>
      <SectionFrame area={area} className="py-16" component="ContentPageTemplate" sectionId={sectionId} variant="editorial-content">
        <div className="container-shell max-w-[var(--container-narrow)]">
          <h1 className="font-display text-4xl font-semibold leading-tight">{title}</h1>
          <p className="mt-4 text-secondary">{body}</p>
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </SectionFrame>
    </main>
  );
}

function entityTypeForContentPage(area: string, sectionId: string): CmsEntityType {
  if (area === "Policy" || sectionId.startsWith("policy.")) {
    return "policy";
  }

  return "landing";
}

function entityIdForContentPage(sectionId: string) {
  if (sectionId.startsWith("policy.")) {
    return sectionId.replace("policy.", "");
  }

  if (sectionId.startsWith("seo.")) {
    return sectionId.replace("seo.", "");
  }

  return sectionId.split(".")[0] || "default";
}
