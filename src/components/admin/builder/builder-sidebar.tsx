/**
 * Combines page switching, layer navigation, and the section library in the builder sidebar.
 */

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CmsKnownSectionType, CmsPageDocument, CmsScope } from "@/lib/cms";
import type { StorefrontEditablePage } from "@/config/storefront-pages.config";
import { StorefrontPageSwitcher } from "../storefront-page-switcher";
import { BuilderLayersPanel } from "./builder-layers-panel";
import { BuilderSectionLibrary } from "./builder-section-library";

export function BuilderSidebar({
  additionalPages = [],
  currentEntityId,
  deletedPageKeys = [],
  document,
  isDeletingPage = false,
  onBeforeNavigate,
  onAddSection,
  onDuplicate,
  onMove,
  onDeletePage,
  onRemove,
  onSelect,
  onToggleHidden,
  scope,
  selectedSectionId
}: {
  additionalPages?: StorefrontEditablePage[];
  currentEntityId: string;
  deletedPageKeys?: string[];
  document: CmsPageDocument;
  isDeletingPage?: boolean;
  onBeforeNavigate?: (href: string) => boolean;
  onAddSection: (type: CmsKnownSectionType) => void;
  onDuplicate: (sectionId: string) => void;
  onMove: (sectionId: string, direction: -1 | 1) => void;
  onDeletePage?: () => void;
  onRemove: (sectionId: string) => void;
  onSelect: (sectionId: string) => void;
  onToggleHidden: (sectionId: string, hidden: boolean) => void;
  scope: CmsScope;
  selectedSectionId: string;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <aside className="grid content-start gap-4">
      <StorefrontPageSwitcher additionalPages={additionalPages} currentEntityId={currentEntityId} currentScope={scope} deletedPageKeys={deletedPageKeys} onBeforeNavigate={onBeforeNavigate} />
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
      {onDeletePage ? (
        <section className="mt-2 grid gap-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Page settings</p>
          <button
            className="flex min-h-11 items-center justify-center gap-2 border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isDeletingPage}
            onClick={onDeletePage}
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {isDeletingPage ? "Deleting page..." : "Delete page permanently"}
          </button>
          <p className="text-[11px] leading-relaxed text-secondary">
            Removes the public page and all of its saved versions. This cannot be undone.
          </p>
        </section>
      ) : null}
    </aside>
  );
}
