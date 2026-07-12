"use client";

import type { CmsSection } from "@/lib/cms";
import { InspectorField, InspectorInput, InspectorSelect } from "./InspectorFields";

export function DesignInspector({ section, updateSection }: { section: CmsSection; updateSection: (patch: Partial<CmsSection>) => void }) {
  return (
    <div className="grid gap-3">
      <InspectorField label="Background tone">
        <InspectorSelect value={String(section.design.backgroundTone ?? "default")} onChange={(event) => updateSection({ design: { backgroundTone: event.currentTarget.value as CmsSection["design"]["backgroundTone"] } })}>
          {["default", "muted", "brand", "dark", "accent"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Background color">
        <InspectorInput type="color" value={String(section.design.backgroundColor ?? "#ffffff")} onChange={(event) => updateSection({ design: { backgroundColor: event.currentTarget.value } })} />
      </InspectorField>
      <InspectorField label="Text color">
        <InspectorInput type="color" value={String(section.design.textColor ?? "#111827")} onChange={(event) => updateSection({ design: { textColor: event.currentTarget.value } })} />
      </InspectorField>
      <InspectorField label="Accent color">
        <InspectorInput type="color" value={String(section.design.accentColor ?? "#f6c945")} onChange={(event) => updateSection({ design: { accentColor: event.currentTarget.value } })} />
      </InspectorField>
      <InspectorField label="Radius">
        <InspectorSelect value={String(section.design.radius ?? "medium")} onChange={(event) => updateSection({ design: { radius: event.currentTarget.value as CmsSection["design"]["radius"] } })}>
          {["none", "small", "medium", "large", "pill"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Shadow">
        <InspectorSelect value={String(section.design.shadow ?? "soft")} onChange={(event) => updateSection({ design: { shadow: event.currentTarget.value as CmsSection["design"]["shadow"] } })}>
          {["none", "soft", "medium", "strong"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Button style">
        <InspectorSelect value={String(section.design.buttonStyle ?? "solid")} onChange={(event) => updateSection({ design: { buttonStyle: event.currentTarget.value as CmsSection["design"]["buttonStyle"] } })}>
          {["solid", "outline", "ghost", "link"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
    </div>
  );
}
