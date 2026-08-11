/**
 * Renders save, preview, and publication controls for CMS drafts.
 */

"use client";

import { Eye, Rocket, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BuilderSaveState } from "./types";

export function BuilderSavePublishControls({
  onPreview,
  onPublish,
  onSaveDraft,
  saveState
}: {
  onPreview: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  saveState: BuilderSaveState;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={saveState.tone === "error" ? "text-xs font-semibold text-red" : saveState.tone === "success" ? "text-xs font-semibold text-green" : "text-xs text-secondary"}>{saveState.message}</span>
      <Button className="h-9 gap-2 px-3" onClick={onSaveDraft} type="button" variant="secondary">
        <Save aria-hidden="true" size={16} />
        Draft
      </Button>
      <Button className="h-9 gap-2 px-3" onClick={onPreview} type="button" variant="secondary">
        <Eye aria-hidden="true" size={16} />
        Preview
      </Button>
      <Button className="h-9 gap-2 px-3" onClick={onPublish} type="button">
        <Rocket aria-hidden="true" size={16} />
        Publish
      </Button>
    </div>
  );
}
