/**
 * Applies reusable section and theme presets from the CMS design system.
 */

"use client";

import { normalizeSectionType, sectionPresets, themePresets, type CmsSection, type SectionPreset, type ThemePreset } from "@/lib/cms";

export function PresetInspector({
  applySectionPreset,
  applyThemePreset,
  selectedSection
}: {
  applySectionPreset: (preset: SectionPreset) => void;
  applyThemePreset: (preset: ThemePreset) => void;
  selectedSection: CmsSection;
}) {
  const selectedType = normalizeSectionType(selectedSection.type);
  const compatibleSectionPresets = sectionPresets.filter((preset) => Boolean(selectedType && preset.sectionTypes.includes(selectedType)));

  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Page visual presets</p>
        <div className="grid gap-2">
          {themePresets.map((preset) => (
            <button className="rounded-md border border-border bg-surface-muted p-3 text-left transition hover:border-primary hover:bg-surface" key={preset.id} onClick={() => applyThemePreset(preset)} type="button">
              <span className="block text-sm font-semibold">{preset.label}</span>
              <span className="mt-1 block text-xs text-secondary">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Section presets</p>
        <div className="grid gap-2">
          {compatibleSectionPresets.map((preset) => (
            <button className="rounded-md border border-border bg-surface-muted p-3 text-left transition hover:border-primary hover:bg-surface" key={preset.id} onClick={() => applySectionPreset(preset)} type="button">
              <span className="block text-sm font-semibold">{preset.label}</span>
              <span className="mt-1 block text-xs text-secondary">{preset.description}</span>
            </button>
          ))}
          {compatibleSectionPresets.length === 0 ? <p className="rounded-md border border-border bg-surface-muted p-3 text-sm text-secondary">No section presets are compatible with {selectedSection.type} yet.</p> : null}
        </div>
      </div>
    </div>
  );
}
