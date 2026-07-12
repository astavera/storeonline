"use client";

import type { CmsPageDocument } from "@/lib/cms";
import { InspectorField, InspectorInput, InspectorTextarea } from "./InspectorFields";

export function SeoInspector({ document, updateSeo }: { document: CmsPageDocument; updateSeo: (seo: Partial<CmsPageDocument["seo"]>) => void }) {
  return (
    <div className="grid gap-3">
      <InspectorField label="SEO title">
        <InspectorInput value={document.seo.title} onChange={(event) => updateSeo({ title: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="SEO description">
        <InspectorTextarea value={document.seo.description} onChange={(event) => updateSeo({ description: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="OG title">
        <InspectorInput value={document.seo.ogTitle ?? ""} onChange={(event) => updateSeo({ ogTitle: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="OG description">
        <InspectorTextarea value={document.seo.ogDescription ?? ""} onChange={(event) => updateSeo({ ogDescription: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="OG image">
        <InspectorInput value={document.seo.ogImage ?? ""} onChange={(event) => updateSeo({ ogImage: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="Canonical URL">
        <InspectorInput value={document.seo.canonicalUrl ?? ""} onChange={(event) => updateSeo({ canonicalUrl: event.currentTarget.value })} />
      </InspectorField>
      <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted p-3 text-sm font-semibold">
        Indexable
        <input checked={document.seo.indexable} onChange={(event) => updateSeo({ indexable: event.currentTarget.checked })} type="checkbox" />
      </label>
    </div>
  );
}
