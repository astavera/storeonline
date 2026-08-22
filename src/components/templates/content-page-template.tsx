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
import { getStorePolicyDefinition } from "@/config/store-administration.config";
import type { CmsEntityType } from "@/lib/cms";
import { readStorePolicyFields } from "@/lib/cms/store-policy-document";
import { readPublishedStorefrontCmsDocument } from "@/server/storefront/published-cms-document";

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
  const publishedDocument = await readPublishedStorefrontCmsDocument({ entityType, entityId });

  if (publishedDocument && entityType === "policy") {
    const definition = getStorePolicyDefinition(entityId);
    if (definition) {
      const fields = readStorePolicyFields(publishedDocument, definition);
      return (
        <PolicyContentPage body={fields.body} effectiveAt={fields.effectiveAt} sectionId={sectionId} title={fields.title}>
          {children}
        </PolicyContentPage>
      );
    }
  }

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  if (entityType === "policy") {
    return <PolicyContentPage body={body} sectionId={sectionId} title={title}>{children}</PolicyContentPage>;
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

function PolicyContentPage({
  body,
  children,
  effectiveAt,
  sectionId,
  title
}: {
  body: string;
  children?: React.ReactNode;
  effectiveAt?: string;
  sectionId: string;
  title: string;
}) {
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <main>
      <SectionFrame area="Policy" className="py-16" component="ContentPageTemplate" sectionId={sectionId} variant="editorial-content">
        <article className="container-shell max-w-[var(--container-narrow)]">
          <h1 className="font-display text-4xl font-semibold leading-tight">{title}</h1>
          {effectiveAt ? <p className="mt-3 text-sm text-secondary">Effective {formatEffectiveDate(effectiveAt)}</p> : null}
          <div className="mt-6 grid gap-5 text-secondary">
            {paragraphs.map((paragraph, index) => <p className="whitespace-pre-line leading-7" key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
          </div>
          {children ? <div className="mt-8">{children}</div> : null}
        </article>
      </SectionFrame>
    </main>
  );
}

function formatEffectiveDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(date);
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
