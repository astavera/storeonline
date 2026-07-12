"use client";

import type { CmsKnownSectionType, CmsPageDocument, CmsScope } from "@/lib/cms";
import { StorefrontPageSwitcher } from "../storefront-page-switcher";
import { BuilderLayersPanel } from "./BuilderLayersPanel";
import { BuilderSectionLibrary } from "./BuilderSectionLibrary";

export function BuilderSidebar({
  currentEntityId,
  document,
  onBeforeNavigate,
  onAddSection,
  onDuplicate,
  onMove,
  onRemove,
  onSelect,
  onToggleHidden,
  scope,
  selectedSectionId
}: {
  currentEntityId: string;
  document: CmsPageDocument;
  onBeforeNavigate?: (href: string) => boolean;
  onAddSection: (type: CmsKnownSectionType) => void;
  onDuplicate: (sectionId: string) => void;
  onMove: (sectionId: string, direction: -1 | 1) => void;
  onRemove: (sectionId: string) => void;
  onSelect: (sectionId: string) => void;
  onToggleHidden: (sectionId: string, hidden: boolean) => void;
  scope: CmsScope;
  selectedSectionId: string;
}) {
  return (
    <aside className="grid content-start gap-4">
      <StorefrontPageSwitcher currentEntityId={currentEntityId} currentScope={scope} onBeforeNavigate={onBeforeNavigate} />
      <BuilderLayersPanel
        document={document}
        onDuplicate={onDuplicate}
        onMove={onMove}
        onRemove={onRemove}
        onSelect={onSelect}
        onToggleHidden={onToggleHidden}
        selectedSectionId={selectedSectionId}
      />
      <BuilderSectionLibrary onAddSection={onAddSection} scope={scope} />
    </aside>
  );
}
