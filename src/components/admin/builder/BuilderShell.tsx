"use client";

import { useMemo, useState } from "react";
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
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderInspector } from "./BuilderInspector";
import { BuilderSidebar } from "./BuilderSidebar";
import { BuilderTopbar } from "./BuilderTopbar";
import type { BuilderDevice, BuilderDocumentHistoryEntry, BuilderInspectorTab, BuilderSaveState } from "./types";

type CmsSaveResponse = {
  ok: boolean;
  status?: string;
  storage?: {
    message?: string;
    versionNumber?: number;
  };
  errors?: string[];
};

export function BuilderShell({ initialDocument, publicPreviewRoute, scope }: { initialDocument: CmsPageDocument; publicPreviewRoute?: string; scope: CmsScope }) {
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
  const [documentState, setDocumentState] = useState(normalizedInitialDocument);
  const [selectedSectionId, setSelectedSectionId] = useState(normalizedInitialDocument.sections[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<BuilderInspectorTab>("content");
  const [device, setDevice] = useState<BuilderDevice>("desktop");
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<BuilderSaveState>({ tone: "idle", message: "Ready" });
  const [history, setHistory] = useState<BuilderDocumentHistoryEntry[]>([]);
  const selectedSection = documentState.sections.find((section) => section.id === selectedSectionId) ?? documentState.sections[0] ?? createCmsSection("emptyState", { id: "builder.empty" });

  function commit(nextDocument: CmsPageDocument) {
    setDocumentState(nextDocument);
    setIsDirty(true);
  }

  function addSection(type: CmsKnownSectionType) {
    const nextDocument = addCmsSection(documentState, type);
    const nextSection = nextDocument.sections[nextDocument.sections.length - 1];

    commit(nextDocument);
    setSelectedSectionId(nextSection.id);
    setActiveTab("content");
  }

  function duplicateSection(sectionId: string) {
    const nextDocument = duplicateCmsSection(documentState, sectionId);
    const currentIndex = documentState.sections.findIndex((section) => section.id === sectionId);
    const duplicatedSection = nextDocument.sections[currentIndex + 1] ?? nextDocument.sections[nextDocument.sections.length - 1];

    commit(nextDocument);
    setSelectedSectionId(duplicatedSection.id);
    setActiveTab("content");
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
  }

  async function persist(operation: "save_draft" | "preview" | "publish") {
    setSaveState({ tone: "idle", message: operation === "publish" ? "Publishing..." : "Saving..." });

    try {
      const response = await fetch("/api/admin/cms", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          operation,
          document: documentState
        })
      });
      const result = (await response.json()) as CmsSaveResponse;

      if (!response.ok || !result.ok) {
        setSaveState({ tone: "error", message: result.errors?.join(" ") || "Could not save CMS document." });
        return;
      }

      const savedAt = new Date().toISOString();
      const nextVersion = result.storage?.versionNumber ?? documentState.version + 1;
      const nextDocument: CmsPageDocument = {
        ...documentState,
        status: operation === "publish" ? "PUBLISHED" : operation === "preview" ? "PREVIEW" : "DRAFT",
        version: nextVersion,
        updatedAt: savedAt,
        publishedAt: operation === "publish" ? savedAt : documentState.publishedAt
      };

      setDocumentState(nextDocument);
      setHistory((current) =>
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
      setIsDirty(false);
      setSaveState({ tone: "success", message: result.storage?.message ?? "Saved." });
    } catch (error) {
      setSaveState({ tone: "error", message: error instanceof Error ? error.message : "Could not save CMS document." });
    }
  }

  return (
    <main className="p-3 lg:p-4">
      <div className="grid gap-4" data-store-area="Admin" data-store-component="BuilderShell" data-store-section={`admin.builder.${scope}`}>
        <BuilderTopbar
          device={device}
          document={documentState}
          isDirty={isDirty}
          onPreview={() => persist("preview")}
          onPublish={() => persist("publish")}
          onSaveDraft={() => persist("save_draft")}
          publicPreviewRoute={publicPreviewRoute}
          saveState={saveState}
          setDevice={setDevice}
        />
        <div className="grid min-h-[760px] gap-3 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
          <BuilderSidebar
            currentEntityId={documentState.entityId}
            document={documentState}
            onBeforeNavigate={() => !isDirty || window.confirm("You have unsaved page changes. Continue to another store area editor?")}
            onAddSection={addSection}
            onDuplicate={duplicateSection}
            onMove={(sectionId, direction) => commit(moveCmsSection(documentState, sectionId, direction))}
            onRemove={removeSection}
            onSelect={(sectionId) => {
              setSelectedSectionId(sectionId);
              setActiveTab("content");
            }}
            onToggleHidden={(sectionId, hidden) => commit(setCmsSectionHidden(documentState, sectionId, hidden))}
            scope={scope}
            selectedSectionId={selectedSection.id}
          />
          <BuilderCanvas device={device} document={documentState} onEdit={editFromCanvas} onSelect={setSelectedSectionId} publicPreviewRoute={publicPreviewRoute} selectedSectionId={selectedSection.id} />
          <BuilderInspector
            activeTab={activeTab}
            document={documentState}
            history={history}
            onApplySectionPreset={(preset) => commit(applySectionPresetToSection(documentState, selectedSection.id, preset))}
            onApplyThemePreset={(preset) => commit(applyThemePresetToDocument(documentState, preset))}
            selectedSection={selectedSection}
            setActiveTab={setActiveTab}
            updateSection={updateSelectedSection}
            updateSeo={(seo) => commit(updateCmsSeo(documentState, seo))}
            updateTheme={(theme) => commit(updateCmsThemeOverrides(documentState, theme))}
          />
        </div>
      </div>
    </main>
  );
}
