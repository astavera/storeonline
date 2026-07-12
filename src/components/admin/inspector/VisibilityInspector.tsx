"use client";

import type { CmsSection } from "@/lib/cms";

export function VisibilityInspector({ section, updateSection }: { section: CmsSection; updateSection: (patch: Partial<CmsSection>) => void }) {
  return (
    <div className="grid gap-2">
      {(["desktop", "tablet", "mobile"] as const).map((device) => (
        <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted p-3 text-sm font-semibold" key={device}>
          Show on {device}
          <input checked={section.visibility[device]} onChange={(event) => updateSection({ visibility: { ...section.visibility, [device]: event.currentTarget.checked } })} type="checkbox" />
        </label>
      ))}
    </div>
  );
}
