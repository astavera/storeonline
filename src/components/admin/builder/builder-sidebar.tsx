/**
 * Combines page switching, layer navigation, and the section library in the builder sidebar.
 */

"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { CmsKnownSectionType, CmsPageDocument, CmsScope } from "@/lib/cms";
import type { StorefrontEditablePage } from "@/config/storefront-pages.config";
import { StorefrontPageSwitcher } from "../storefront-page-switcher";
import { BuilderLayersPanel } from "./builder-layers-panel";
import { BuilderSectionLibrary } from "./builder-section-library";

export function BuilderSidebar({
  additionalPages = [],
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
  additionalPages?: StorefrontEditablePage[];
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
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <aside className="grid content-start gap-4">
      <StorefrontPageSwitcher additionalPages={additionalPages} currentEntityId={currentEntityId} currentScope={scope} onBeforeNavigate={onBeforeNavigate} />
      <BuilderLayersPanel
        document={document}
        onDuplicate={onDuplicate}
        onMove={onMove}
        onRemove={onRemove}
        onSelect={onSelect}
        onToggleHidden={onToggleHidden}
        selectedSectionId={selectedSectionId}
      />
      <button
        aria-expanded={libraryOpen}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-surface-muted text-sm font-semibold transition hover:bg-border"
        onClick={() => setLibraryOpen((current) => !current)}
        type="button"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add section
      </button>
      {libraryOpen ? (
        <BuilderSectionLibrary
          onAddSection={(type) => {
            onAddSection(type);
            setLibraryOpen(false);
          }}
          scope={scope}
        />
      ) : null}
    </aside>
  );
}
