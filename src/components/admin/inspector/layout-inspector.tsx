/**
 * Edits spacing, width, alignment, and column settings for a CMS section.
 */

"use client";

import type { CmsSection } from "@/lib/cms";
import { InspectorField, InspectorInput, InspectorSelect } from "./inspector-fields";

export function LayoutInspector({ section, updateSection }: { section: CmsSection; updateSection: (patch: Partial<CmsSection>) => void }) {
  return (
    <div className="grid gap-3">
      <InspectorField label="Alignment">
        <InspectorSelect value={String(section.layout.alignment ?? "left")} onChange={(event) => updateSection({ layout: { alignment: event.currentTarget.value as CmsSection["layout"]["alignment"] } })}>
          {["left", "center", "right"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Container width">
        <InspectorSelect value={String(section.layout.containerWidth ?? "wide")} onChange={(event) => updateSection({ layout: { containerWidth: event.currentTarget.value as CmsSection["layout"]["containerWidth"] } })}>
          {["narrow", "normal", "wide", "full"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Image position">
        <InspectorSelect value={String(section.layout.imagePosition ?? "none")} onChange={(event) => updateSection({ layout: { imagePosition: event.currentTarget.value as CmsSection["layout"]["imagePosition"] } })}>
          {["left", "right", "background", "none"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Columns">
        <InspectorInput min={1} max={6} type="number" value={Number(section.layout.columns ?? 3)} onChange={(event) => updateSection({ layout: { columns: Number(event.currentTarget.value) } })} />
      </InspectorField>
      <InspectorField label="Padding top">
        <InspectorInput min={0} type="number" value={Number(section.layout.paddingTop ?? 56)} onChange={(event) => updateSection({ layout: { paddingTop: Number(event.currentTarget.value) } })} />
      </InspectorField>
      <InspectorField label="Padding bottom">
        <InspectorInput min={0} type="number" value={Number(section.layout.paddingBottom ?? 56)} onChange={(event) => updateSection({ layout: { paddingBottom: Number(event.currentTarget.value) } })} />
      </InspectorField>
    </div>
  );
}
