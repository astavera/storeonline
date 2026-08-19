/**
 * Manages the page builder document state, history, selection, and persistence workflow.
 */

"use client";

import { ArrowLeft, Palette } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addCmsSection,
  applySectionPresetToSection,
  applyThemePresetToDocument,
  createCmsSection,
  duplicateCmsSection,
  moveCmsSection,
  removeCmsSection,
  setCmsSectionHidden,
  updateCmsSection,
  updateCmsSeo,
  updateCmsThemeOverrides,
  type CmsKnownSectionType,
  type CmsPageDocument,
  type CmsScope,
  type CmsSection
} from "@/lib/cms";
import { BuilderCanvas } from "./builder-canvas";
import { BuilderInspector } from "./builder-inspector";
import { BuilderSidebar } from "./builder-sidebar";
import { BuilderTopbar } from "./builder-topbar";
import { commitEditingHistory, createEditingHistory, redoEditingHistory, undoEditingHistory } from "./editing-history";
import type { BuilderDevice, BuilderDocumentHistoryEntry, BuilderInspectorTab, BuilderSaveState } from "./types";
import type { StorefrontEditablePage } from "@/config/storefront-pages.config";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

type CmsSaveResponse = {
  document?: CmsPageDocument;
  ok: boolean;
  status?: string;
  storage?: {
    message?: string;
    versionNumber?: number;
  };
  errors?: string[];
  restoredFromVersion?: number;
  versions?: BuilderDocumentHistoryEntry[];
};

export function BuilderShell({ additionalPages = [], catalogProducts = [], deletedPageKeys = [], initialDocument, publicPreviewRoute, scope }: { additionalPages?: StorefrontEditablePage[]; catalogProducts?: StorefrontProduct[]; deletedPageKeys?: string[]; initialDocument: CmsPageDocument; publicPreviewRoute?: string; scope: CmsScope }) {
  const router = useRouter();
  const normalizedInitialDocument = useMemo(() => {
    if (initialDocument.sections.length > 0) {
      return initialDocument;
    }

    return addCmsSection(initialDocument, "emptyState", {
      id: `${initialDocument.entityId}.empty-state`,
      content: {
        title: "Start building this page",
        body: "Add sections from the library to create this storefront page."
      }
    });
  }, [initialDocument]);
  const [editingHistory, setEditingHistory] = useState(() => createEditingHistory(normalizedInitialDocument));
  const editingHistoryRef = useRef(editingHistory);
  const savedDocumentRef = useRef(documentSignature(normalizedInitialDocument));
  const documentState = editingHistory.present;
  const [selectedSectionId, setSelectedSectionId] = useState(normalizedInitialDocument.sections[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<BuilderInspectorTab>("content");
  const [device, setDevice] = useState<BuilderDevice>("desktop");
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<BuilderSaveState>({ tone: "idle", message: "Ready" });
  const [versionHistory, setVersionHistory] = useState<BuilderDocumentHistoryEntry[]>([]);
  const [sidebarMode, setSidebarMode] = useState<"sections" | "inspector">("sections");
  const [isDeletingPage, setIsDeletingPage] = useState(false);
  const selectedSection = documentState.sections.find((section) => section.id === selectedSectionId) ?? documentState.sections[0] ?? createCmsSection("emptyState", { id: "builder.empty" });

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ entityId: initialDocument.entityId, entityType: initialDocument.entityType });

    fetch(`/api/admin/cms?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: (await response.json()) as CmsSaveResponse }))
      .then(({ response, result }) => {
        if (!cancelled && response.ok && result.ok) setVersionHistory(result.versions ?? []);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [initialDocument.entityId, initialDocument.entityType]);

  function commit(nextDocument: CmsPageDocument) {
    const nextHistory = commitEditingHistory(editingHistoryRef.current, nextDocument);
    editingHistoryRef.current = nextHistory;
    setEditingHistory(nextHistory);
    setIsDirty(documentSignature(nextHistory.present) !== savedDocumentRef.current);
  }

  function undo() {
    applyEditingHistory(undoEditingHistory(editingHistoryRef.current));
  }

  function redo() {
    applyEditingHistory(redoEditingHistory(editingHistoryRef.current));
  }

  function applyEditingHistory(nextHistory: typeof editingHistory) {
    if (nextHistory === editingHistoryRef.current) return;
    editingHistoryRef.current = nextHistory;
    setEditingHistory(nextHistory);
    setIsDirty(documentSignature(nextHistory.present) !== savedDocumentRef.current);
    if (!nextHistory.present.sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(nextHistory.present.sections[0]?.id ?? "");
    }
  }

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (key === "z") {
        event.preventDefault();
        undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  });

  function addSection(type: CmsKnownSectionType) {
    const nextDocument = addCmsSection(documentState, type);
    const nextSection = nextDocument.sections[nextDocument.sections.length - 1];

    commit(nextDocument);
    setSelectedSectionId(nextSection.id);
    setActiveTab("content");
    setSidebarMode("inspector");
  }

  function duplicateSection(sectionId: string) {
    const nextDocument = duplicateCmsSection(documentState, sectionId);
    const currentIndex = documentState.sections.findIndex((section) => section.id === sectionId);
    const duplicatedSection = nextDocument.sections[currentIndex + 1] ?? nextDocument.sections[nextDocument.sections.length - 1];

    commit(nextDocument);
    setSelectedSectionId(duplicatedSection.id);
    setActiveTab("content");
    setSidebarMode("inspector");
  }

  function removeSection(sectionId: string) {
    const nextDocument = removeCmsSection(documentState, sectionId);
    const nextSelected = nextDocument.sections.find((section) => section.id === selectedSectionId) ?? nextDocument.sections[0];

    commit(nextDocument);

    if (nextSelected) {
      setSelectedSectionId(nextSelected.id);
    }
  }

  function updateSelectedSection(patch: Partial<CmsSection>) {
    commit(updateCmsSection(documentState, selectedSection.id, patch));
  }

  function editFromCanvas(sectionId: string, tab: BuilderInspectorTab) {
    setSelectedSectionId(sectionId);
    setActiveTab(tab);
    setSidebarMode("inspector");
  }

  async function persist(operation: "save_draft" | "preview" | "publish") {
    const submittedDocument = documentState;
    setSaveState({ tone: "idle", message: operation === "publish" ? "Publishing..." : "Saving..." });

    try {
      const response = await fetch("/api/admin/cms", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          operation,
          document: submittedDocument
        })
      });
      const result = (await response.json()) as CmsSaveResponse;

      if (!response.ok || !result.ok) {
        setSaveState({ tone: "error", message: result.errors?.join(" ") || "Could not save CMS document." });
        return;
      }

      const savedAt = new Date().toISOString();
      const nextVersion = result.storage?.versionNumber ?? submittedDocument.version + 1;
      const nextDocument: CmsPageDocument = {
        ...submittedDocument,
        status: operation === "publish" ? "PUBLISHED" : operation === "preview" ? "PREVIEW" : "DRAFT",
        version: nextVersion,
        updatedAt: savedAt,
        publishedAt: operation === "publish" ? savedAt : submittedDocument.publishedAt
      };

      const currentHistory = editingHistoryRef.current;
      savedDocumentRef.current = documentSignature(nextDocument);
      if (currentHistory.present === submittedDocument) {
        const nextHistory = { ...currentHistory, present: nextDocument };
        editingHistoryRef.current = nextHistory;
        setEditingHistory(nextHistory);
      }
      setVersionHistory((current) =>
        [
          {
            version: nextVersion,
            status: result.status ?? nextDocument.status,
            title: nextDocument.title,
            updatedAt: savedAt
          },
          ...current
        ].slice(0, 12)
      );
      setIsDirty(documentSignature(editingHistoryRef.current.present) !== savedDocumentRef.current);
      setSaveState({ tone: "success", message: result.storage?.message ?? "Saved." });
    } catch (error) {
      setSaveState({ tone: "error", message: error instanceof Error ? error.message : "Could not save CMS document." });
    }
  }

  async function restoreVersion(versionNumber: number) {
    if (!window.confirm(`Restore version ${versionNumber} as an unsaved draft? Your current unsaved changes will be replaced.`)) return;
    setSaveState({ tone: "idle", message: `Restoring version ${versionNumber}...` });

    try {
      const response = await fetch("/api/admin/cms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "restore",
          entityType: documentState.entityType,
          entityId: documentState.entityId,
          versionNumber
        })
      });
      const result = (await response.json()) as CmsSaveResponse;
      if (!response.ok || !result.ok || !result.document) {
        setSaveState({ tone: "error", message: result.errors?.join(" ") || "Could not restore CMS version." });
        return;
      }

      const restoredDocument: CmsPageDocument = {
        ...result.document,
        id: documentState.id,
        entityType: documentState.entityType,
        entityId: documentState.entityId,
        status: "DRAFT",
        version: documentState.version,
        updatedAt: new Date().toISOString(),
        publishedAt: documentState.publishedAt
      };
      commit(restoredDocument);
      setSelectedSectionId(restoredDocument.sections[0]?.id ?? "");
      setSaveState({ tone: "success", message: `Version ${versionNumber} restored as an unsaved draft.` });
    } catch (error) {
      setSaveState({ tone: "error", message: error instanceof Error ? error.message : "Could not restore CMS version." });
    }
  }

  async function deletePage() {
    const confirmed = window.confirm(
      `Permanently delete “${documentState.title}”?\n\nThis removes every saved version, hides it from the Website Editor, and makes ${publicPreviewRoute ?? "its public URL"} return 404. This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingPage(true);
    setSaveState({ tone: "idle", message: "Deleting page..." });

    try {
      const response = await fetch("/api/admin/cms", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: documentState.entityType,
          entityId: documentState.entityId,
          title: documentState.title
        })
      });
      const result = (await response.json()) as CmsSaveResponse;

      if (!response.ok || !result.ok) {
        setSaveState({ tone: "error", message: result.errors?.join(" ") || "Could not delete this page." });
        setIsDeletingPage(false);
        return;
      }

      router.replace("/admin/homepage");
      router.refresh();
    } catch (error) {
      setSaveState({ tone: "error", message: error instanceof Error ? error.message : "Could not delete this page." });
      setIsDeletingPage(false);
    }
  }

  return (
    <main className="min-h-screen bg-white lg:h-screen lg:overflow-hidden" data-store-area="Admin" data-store-component="BuilderShell" data-store-section={`admin.builder.${scope}`}>
      <div className="grid min-h-screen lg:h-full lg:min-h-0 lg:grid-cols-[344px_minmax(0,1fr)] lg:grid-rows-[80px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-surface lg:row-span-2 lg:flex lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex h-20 shrink-0 items-center gap-3 border-b border-border px-5">
            <Link aria-label="Back to Admin" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-muted text-secondary transition hover:text-primary" href="/admin">
              <ArrowLeft aria-hidden="true" className="size-5" />
            </Link>
            <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-md bg-surface-muted px-4">
              <Palette aria-hidden="true" className="size-5" />
              <span className="truncate font-semibold">Site design</span>
            </div>
          </div>
          <div className="p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
            {sidebarMode === "sections" ? (
              <BuilderSidebar
                additionalPages={additionalPages}
                currentEntityId={documentState.entityId}
                deletedPageKeys={deletedPageKeys}
                document={documentState}
                isDeletingPage={isDeletingPage}
                onBeforeNavigate={() => !isDirty || window.confirm("You have unsaved page changes. Continue to another store area editor?")}
                onAddSection={addSection}
                onDuplicate={duplicateSection}
                onMove={(sectionId, direction) => commit(moveCmsSection(documentState, sectionId, direction))}
                onDeletePage={(["department", "holiday", "location", "policy", "landing"] as CmsScope[]).includes(scope) ? deletePage : undefined}
                onRemove={removeSection}
                onSelect={(sectionId) => {
                  setSelectedSectionId(sectionId);
                  setActiveTab("content");
                  setSidebarMode("inspector");
                }}
                onToggleHidden={(sectionId, hidden) => commit(setCmsSectionHidden(documentState, sectionId, hidden))}
                scope={scope}
                selectedSectionId={selectedSection.id}
              />
            ) : (
              <BuilderInspector
                activeTab={activeTab}
                catalogProducts={catalogProducts}
                document={documentState}
                history={versionHistory}
                onApplySectionPreset={(preset) => commit(applySectionPresetToSection(documentState, selectedSection.id, preset))}
                onApplyThemePreset={(preset) => commit(applyThemePresetToDocument(documentState, preset))}
                onDone={() => setSidebarMode("sections")}
                onRestoreVersion={restoreVersion}
                selectedSection={selectedSection}
                setActiveTab={setActiveTab}
                updateSection={updateSelectedSection}
                updateSeo={(seo) => commit(updateCmsSeo(documentState, seo))}
                updateTheme={(theme) => commit(updateCmsThemeOverrides(documentState, theme))}
              />
            )}
          </div>
        </aside>
        <BuilderTopbar
          canRedo={editingHistory.future.length > 0}
          canUndo={editingHistory.past.length > 0}
          device={device}
          document={documentState}
          isDirty={isDirty}
          onRedo={redo}
          onPreview={() => persist("preview")}
          onPublish={() => persist("publish")}
          onSaveDraft={() => persist("save_draft")}
          onUndo={undo}
          publicPreviewRoute={publicPreviewRoute}
          saveState={saveState}
          setDevice={setDevice}
        />
        <BuilderCanvas
          device={device}
          document={documentState}
          onEdit={editFromCanvas}
          onSelect={(sectionId) => {
            setSelectedSectionId(sectionId);
            setActiveTab("content");
            setSidebarMode("inspector");
          }}
          publicPreviewRoute={publicPreviewRoute}
          selectedSectionId={selectedSection.id}
        />
      </div>
    </main>
  );
}

function documentSignature(document: CmsPageDocument) {
  return JSON.stringify({
    id: document.id,
    entityType: document.entityType,
    entityId: document.entityId,
    title: document.title,
    slug: document.slug,
    seo: document.seo,
    themeOverrides: document.themeOverrides,
    sections: document.sections
  });
}
