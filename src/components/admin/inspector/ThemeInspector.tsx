"use client";

import { defaultThemeTokens, mergeThemeTokens, type CmsPageDocument, type ThemeTokenOverrides } from "@/lib/cms";
import { InspectorField, InspectorInput, InspectorSelect } from "./InspectorFields";

export function ThemeInspector({ document, updateTheme }: { document: CmsPageDocument; updateTheme: (theme: ThemeTokenOverrides) => void }) {
  const theme = mergeThemeTokens(defaultThemeTokens, document.themeOverrides);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        {(["primary", "secondary", "accent", "background", "surface", "muted", "border", "text", "success", "warning", "danger"] as const).map((color) => (
          <InspectorField key={color} label={color}>
            <InspectorInput type="color" value={theme.colors[color]} onChange={(event) => updateTheme({ colors: { [color]: event.currentTarget.value } })} />
          </InspectorField>
        ))}
      </div>
      <InspectorField label="Heading scale">
        <InspectorSelect value={theme.typography.headingScale} onChange={(event) => updateTheme({ typography: { headingScale: event.currentTarget.value as typeof theme.typography.headingScale } })}>
          {["compact", "standard", "editorial", "display"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Section padding">
        <InspectorInput min={0} type="number" value={theme.spacing.sectionPadding} onChange={(event) => updateTheme({ spacing: { sectionPadding: Number(event.currentTarget.value) } })} />
      </InspectorField>
      <InspectorField label="Grid gap">
        <InspectorInput min={0} type="number" value={theme.grid.gap} onChange={(event) => updateTheme({ grid: { gap: Number(event.currentTarget.value) } })} />
      </InspectorField>
      <InspectorField label="Radius">
        <InspectorSelect value={theme.radius} onChange={(event) => updateTheme({ radius: event.currentTarget.value as typeof theme.radius })}>
          {["none", "small", "medium", "large", "pill"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Shadows">
        <InspectorSelect value={theme.shadows} onChange={(event) => updateTheme({ shadows: event.currentTarget.value as typeof theme.shadows })}>
          {["none", "soft", "medium", "strong"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Button style">
        <InspectorSelect value={theme.buttons.style} onChange={(event) => updateTheme({ buttons: { style: event.currentTarget.value as typeof theme.buttons.style } })}>
          {["solid", "outline", "ghost", "link"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      <InspectorField label="Product grid desktop columns">
        <InspectorInput min={1} max={6} type="number" value={theme.grid.desktopColumns} onChange={(event) => updateTheme({ grid: { desktopColumns: Number(event.currentTarget.value) } })} />
      </InspectorField>
    </div>
  );
}
