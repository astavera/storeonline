/**
 * Edits image sources, alternative text, and media placement for a CMS section.
 */

"use client";

import type { CmsSection } from "@/lib/cms";
import { InspectorField, InspectorInput } from "./inspector-fields";

export function MediaInspector({ section, updateSection }: { section: CmsSection; updateSection: (patch: Partial<CmsSection>) => void }) {
  return (
    <div className="grid gap-3">
      <InspectorField label="Image URL">
        <InspectorInput value={String(section.media.image ?? "")} onChange={(event) => updateSection({ media: { image: event.currentTarget.value } })} placeholder="/uploads/admin/photo.jpg" />
      </InspectorField>
      <InspectorField label="Image alt text">
        <InspectorInput value={String(section.media.imageAlt ?? "")} onChange={(event) => updateSection({ media: { imageAlt: event.currentTarget.value } })} />
      </InspectorField>
      <InspectorField label="Mobile image URL">
        <InspectorInput value={String(section.media.mobileImage ?? "")} onChange={(event) => updateSection({ media: { mobileImage: event.currentTarget.value } })} />
      </InspectorField>
      <InspectorField label="Video URL">
        <InspectorInput value={String(section.media.videoUrl ?? "")} onChange={(event) => updateSection({ media: { videoUrl: event.currentTarget.value } })} />
      </InspectorField>
      {section.media.image ? (
        <img alt={section.media.imageAlt || section.label} className="aspect-[4/3] w-full rounded-md border border-border object-cover" src={String(section.media.image)} />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-surface-muted p-6 text-sm text-secondary">No image selected. The storefront will use the section fallback treatment.</div>
      )}
    </div>
  );
}
