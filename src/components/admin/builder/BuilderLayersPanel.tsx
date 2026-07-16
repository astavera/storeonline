"use client";

import type { CmsPageDocument } from "@/lib/cms";
import { BuilderSectionList } from "./BuilderSectionList";

export function BuilderLayersPanel({
  document,
  onDuplicate,
  onMove,
  onRemove,
  onSelect,
  onToggleHidden,
  selectedSectionId
}: {
  document: CmsPageDocument;
  onDuplicate: (sectionId: string) => void;
  onMove: (sectionId: string, direction: -1 | 1) => void;
  onRemove: (sectionId: string) => void;
  onSelect: (sectionId: string) => void;
  onToggleHidden: (sectionId: string, hidden: boolean) => void;
  selectedSectionId: string;
}) {
  return (
    <section>
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Page structure</p>
        <h2 className="font-display text-lg font-semibold">Page sections</h2>
      </div>
      <BuilderSectionList
        document={document}
        onDuplicate={onDuplicate}
        onMove={onMove}
        onRemove={onRemove}
        onSelect={onSelect}
        onToggleHidden={onToggleHidden}
        selectedSectionId={selectedSectionId}
      />
    </section>
  );
}
