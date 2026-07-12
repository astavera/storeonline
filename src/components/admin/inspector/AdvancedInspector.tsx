"use client";

import type { CmsSection } from "@/lib/cms";
import { InspectorField, InspectorInput, InspectorTextarea } from "./InspectorFields";

export function AdvancedInspector({ section, updateSection }: { section: CmsSection; updateSection: (patch: Partial<CmsSection>) => void }) {
  return (
    <div className="grid gap-3">
      <InspectorField label="Anchor ID">
        <InspectorInput value={section.advanced.anchorId ?? ""} onChange={(event) => updateSection({ advanced: { anchorId: event.currentTarget.value } })} />
      </InspectorField>
      <InspectorField label="Custom class">
        <InspectorInput value={section.advanced.customClassName ?? ""} onChange={(event) => updateSection({ advanced: { customClassName: event.currentTarget.value } })} />
      </InspectorField>
      <InspectorField label="Safe rich text">
        <InspectorTextarea value={section.advanced.safeRichTextHtml ?? ""} onChange={(event) => updateSection({ advanced: { safeRichTextHtml: event.currentTarget.value } })} />
      </InspectorField>
      <InspectorField label="Internal notes">
        <InspectorTextarea value={section.advanced.notes ?? ""} onChange={(event) => updateSection({ advanced: { notes: event.currentTarget.value } })} />
      </InspectorField>
      <p className="rounded-md border border-border bg-surface-muted p-3 text-xs text-secondary">Custom scripts, arbitrary iframes and third-party code embeds are intentionally blocked until security review.</p>
    </div>
  );
}
