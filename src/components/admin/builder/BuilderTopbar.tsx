"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CmsPageDocument } from "@/lib/cms";
import { BuilderDevicePreview } from "./BuilderDevicePreview";
import { BuilderSavePublishControls } from "./BuilderSavePublishControls";
import type { BuilderDevice, BuilderSaveState } from "./types";

export function BuilderTopbar({
  device,
  document,
  isDirty,
  onPreview,
  onPublish,
  onSaveDraft,
  publicPreviewRoute,
  saveState,
  setDevice
}: {
  device: BuilderDevice;
  document: CmsPageDocument;
  isDirty: boolean;
  onPreview: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  publicPreviewRoute?: string;
  saveState: BuilderSaveState;
  setDevice: (device: BuilderDevice) => void;
}) {
  return (
    <header className="rounded-md border border-border bg-surface p-4 shadow-soft">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Website editor</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{document.title}</h1>
            <span className="rounded-md border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-secondary">v{document.version}</span>
            {isDirty ? <span className="rounded-md bg-[rgba(255,221,87,0.26)] px-2 py-1 text-xs font-semibold">Unsaved</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BuilderDevicePreview device={device} setDevice={setDevice} />
          <Button className="h-9 gap-2 px-3" onClick={() => window.open(publicPreviewRoute || document.slug || "/", "_blank", "noopener,noreferrer")} type="button" variant="quiet">
            <ExternalLink aria-hidden="true" size={16} />
            Open
          </Button>
          <BuilderSavePublishControls onPreview={onPreview} onPublish={onPublish} onSaveDraft={onSaveDraft} saveState={saveState} />
        </div>
      </div>
    </header>
  );
}
