/**
 * Renders builder navigation, history actions, device controls, and save status.
 */

"use client";

import { Clock3, Redo2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CmsPageDocument } from "@/lib/cms";
import { BuilderDevicePreview } from "./builder-device-preview";
import type { BuilderDevice, BuilderSaveState } from "./types";

export function BuilderTopbar({
  device,
  document,
  canRedo,
  canUndo,
  isDirty,
  onRedo,
  onPreview,
  onPublish,
  onSaveDraft,
  onUndo,
  publicPreviewRoute,
  saveState,
  setDevice
}: {
  device: BuilderDevice;
  document: CmsPageDocument;
  canRedo: boolean;
  canUndo: boolean;
  isDirty: boolean;
  onRedo: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  onUndo: () => void;
  publicPreviewRoute?: string;
  saveState: BuilderSaveState;
  setDevice: (device: BuilderDevice) => void;
}) {
  const statusTone = saveState.tone === "error" ? "text-red" : saveState.tone === "success" ? "text-green" : "text-secondary";

  return (
    <header className="flex h-20 min-w-0 items-center justify-between gap-4 border-b border-border bg-white px-5">
      <div className="flex min-w-0 items-center gap-3">
        <BuilderDevicePreview device={device} setDevice={setDevice} />
        <div className="hidden items-center gap-1 sm:flex">
          <button aria-label="Undo" className="grid size-10 place-items-center rounded-full text-secondary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35" disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)" type="button">
            <Undo2 aria-hidden="true" className="size-4" />
          </button>
          <button aria-label="Redo" className="grid size-10 place-items-center rounded-full text-secondary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35" disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Shift+Z)" type="button">
            <Redo2 aria-hidden="true" className="size-4" />
          </button>
        </div>
        <span className="hidden truncate text-sm font-semibold text-secondary 2xl:block">{document.title}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={`hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-semibold xl:inline-flex ${statusTone}`}>
          <Clock3 aria-hidden="true" className="size-3.5" />
          {isDirty ? "Unsaved" : saveState.message}
        </span>
        <button aria-label="Save draft" className="grid size-11 place-items-center rounded-full text-primary transition hover:bg-surface" onClick={onSaveDraft} type="button">
          <Save aria-hidden="true" className="size-4" />
        </button>
        <Button className="h-12 rounded-full bg-surface px-5 text-primary hover:bg-surface-muted" onClick={onPreview} title={publicPreviewRoute ? `Preview ${publicPreviewRoute}` : "Preview"} type="button" variant="quiet">
          Preview
        </Button>
        <Button className="h-12 rounded-full bg-primary px-5 text-white hover:bg-primary/90" onClick={onPublish} type="button">
          Publish
        </Button>
      </div>
    </header>
  );
}
