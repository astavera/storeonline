"use client";

import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  GripVertical,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  ListChecks,
  Monitor,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Plus,
  Redo2,
  Save,
  Search,
  Trash2,
  ShieldCheck,
  Smartphone,
  Tablet,
  Undo2,
  Upload
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { StorefrontPageSwitcher } from "@/components/admin/storefront-page-switcher";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { HomePageTemplate } from "@/components/templates/home-page-template";
import { Button } from "@/components/ui/button";
import { defaultHeaderNavigation, type HeaderNavigationConfig, type HeaderNavigationLink } from "@/config/header-navigation.config";
import { defaultHomepageSeo, type HomepageSeoConfig } from "@/config/homepage-seo.config";
import { storefrontEditablePages, type StorefrontEditablePage } from "@/config/storefront-pages.config";
import {
  defaultHomepageImage,
  homepageImagePresets,
  homepageSections,
  homepageSectionTemplates,
  type HomepageHeroSize,
  type HomepageImagePreset,
  type HomepageItemPresentation,
  type HomepageItemLinkOption,
  type HomepageItemLinkType,
  type HomepageSectionConfig,
  type HomepageSectionElement,
  type HomepageSectionItem,
  type HomepageSectionTemplate
} from "@/config/homepage.config";
import { storefrontProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { cn } from "@/lib/utils";
import { commitEditingHistory, createEditingHistory, redoEditingHistory, undoEditingHistory } from "@/components/admin/builder/editing-history";

type HomepageVersionSummary = {
  versionNumber: number;
  status: string;
  title: string;
  createdAt: string;
  publishedAt: string | null;
  summary: string;
};

type HomepageStudioEditorProps = {
  additionalPages?: StorefrontEditablePage[];
  initialHeaderNavigation?: HeaderNavigationConfig;
  initialPhotoPresets?: HomepageImagePreset[];
  initialSections: HomepageSectionConfig[];
  initialSeo?: HomepageSeoConfig;
  initialVersions?: HomepageVersionSummary[];
  itemLinkOptions?: HomepageItemLinkOption[];
  previewProducts?: StorefrontProduct[];
};

type PreviewMode = "desktop" | "tablet" | "mobile";
type EditorPanel = "content" | "design" | "media" | "navigation" | "seo" | "checks" | "history";
type EditorFocus = "section" | "eyebrow" | "title" | "body" | "ctaLabel" | "ctaHref" | "media" | "imageAlt" | "items" | "textPosition" | "mediaPlacement" | "backgroundTone" | "contentWidth" | "verticalPadding" | "columns" | "heroSize";
type EditorFocusRequest = {
  field: EditorFocus;
  token: number;
};
type PreviewEditTarget = {
  sectionId: string;
  panel: EditorPanel;
  focus: EditorFocus;
};
type SaveState = {
  tone: "idle" | "success" | "error";
  message: string;
};

type HomepageEditingSnapshot = {
  headerNavigation: HeaderNavigationConfig;
  sections: HomepageSectionConfig[];
  photoPresets: HomepageImagePreset[];
  seo: HomepageSeoConfig;
  changeSummary: string;
};

type AdminUploadedMediaAsset = {
  fileName: string;
  originalName: string;
  url: string;
};

type AdminMediaUploadResponse = {
  ok: boolean;
  asset?: AdminUploadedMediaAsset;
  errors?: string[];
};

type AdminOperationResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  status?: string;
  storage?: {
    message?: string;
    persisted?: boolean;
    versionNumber?: number;
  };
  version?: {
    versionNumber?: number;
  };
  errors?: string[];
};

type ValidationResult = {
  errors: string[];
  warnings: string[];
};

const maxBrowserImageUploadBytes = 5 * 1024 * 1024;

const coreHomepageSectionIds = new Set(homepageSections.map((section) => section.sectionId));

const panelTabs: Array<{ id: EditorPanel; label: string; icon: typeof PanelRight }> = [
  { id: "content", label: "Content", icon: PanelRight },
  { id: "design", label: "Design", icon: LayoutDashboard },
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "navigation", label: "Navigation", icon: Link2 },
  { id: "seo", label: "SEO", icon: Search },
  { id: "checks", label: "Checks", icon: ListChecks },
  { id: "history", label: "History", icon: History }
];

export function HomepageStudioEditor({
  additionalPages = [],
  initialHeaderNavigation = defaultHeaderNavigation,
  initialPhotoPresets = homepageImagePresets,
  initialSections,
  initialSeo = defaultHomepageSeo,
  initialVersions = [],
  itemLinkOptions = [],
  previewProducts = []
}: HomepageStudioEditorProps) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const [editingHistory, setEditingHistory] = useState(() => createEditingHistory<HomepageEditingSnapshot>({
    headerNavigation: initialHeaderNavigation,
    sections: [...initialSections].sort((a, b) => a.sortOrder - b.sortOrder),
    photoPresets: initialPhotoPresets.length > 0 ? initialPhotoPresets : homepageImagePresets,
    seo: { ...defaultHomepageSeo, ...initialSeo },
    changeSummary: "Homepage visual update"
  }));
  const editingHistoryRef = useRef(editingHistory);
  const savedSnapshotRef = useRef(homepageSnapshotSignature(editingHistory.present));
  const { changeSummary, headerNavigation, photoPresets, sections, seo } = editingHistory.present;
  const [versions, setVersions] = useState<HomepageVersionSummary[]>(initialVersions);
  const [selectedSectionId, setSelectedSectionId] = useState(initialSections[0]?.sectionId ?? "home.hero");
  const [activePanel, setActivePanel] = useState<EditorPanel>("content");
  const [sidebarMode, setSidebarMode] = useState<"sections" | "inspector">("sections");
  const [focusRequest, setFocusRequest] = useState<EditorFocusRequest | null>(null);
  const [selectedNavigationItemId, setSelectedNavigationItemId] = useState(headerNavigation.primary[0]?.id ?? "shop-all");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [saveState, setSaveState] = useState<SaveState>({ tone: "idle", message: "Ready" });
  const [requiresReauthentication, setRequiresReauthentication] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [previewFrameWidth, setPreviewFrameWidth] = useState(0);
  const [previewCanvasHeight, setPreviewCanvasHeight] = useState(0);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const selectedSection = useMemo(() => sections.find((section) => section.sectionId === selectedSectionId) ?? sections[0], [sections, selectedSectionId]);
  const visibleSections = sections.filter((section) => section.isVisible);
  const validation = useMemo(() => validateHomepage(sections, seo), [sections, seo]);
  const previewDesignWidth = previewCanvasDesignWidth(previewMode);
  const previewScale = previewFrameWidth > 0 ? Math.min(1, Math.max(0.25, (previewFrameWidth - 2) / previewDesignWidth)) : 1;
  const scaledPreviewHeight = previewCanvasHeight > 0 ? previewCanvasHeight * previewScale : undefined;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const frame = previewFrameRef.current;

    if (!frame || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setPreviewFrameWidth(entry.contentRect.width);
    });

    setPreviewFrameWidth(frame.clientWidth);
    observer.observe(frame);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = previewCanvasRef.current;

    if (!canvas || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateCanvasHeight = () => setPreviewCanvasHeight(canvas.scrollHeight);
    const observer = new ResizeObserver(updateCanvasHeight);

    updateCanvasHeight();
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [sections, previewMode]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    function handlePresetUse(event: MouseEvent) {
      const target = event.target instanceof Element ? (event.target.closest("[data-photo-preset-url]") as HTMLElement | null) : null;

      if (!target || !editor?.contains(target)) {
        return;
      }

      event.preventDefault();
      const imageUrl = target.dataset.photoPresetUrl || defaultHomepageImage;
      updateSelected({ backgroundImage: imageUrl, mediaPlacement: "background" });
      setActivePanel("media");
    }

    editor.addEventListener("click", handlePresetUse);

    return () => editor.removeEventListener("click", handlePresetUse);
  }, [selectedSectionId]);

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

  function commitSnapshot(updater: (current: HomepageEditingSnapshot) => HomepageEditingSnapshot) {
    const nextSnapshot = updater(editingHistoryRef.current.present);
    const nextHistory = commitEditingHistory(editingHistoryRef.current, nextSnapshot);
    editingHistoryRef.current = nextHistory;
    setEditingHistory(nextHistory);
    setIsDirty(homepageSnapshotSignature(nextHistory.present) !== savedSnapshotRef.current);
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
    setIsDirty(homepageSnapshotSignature(nextHistory.present) !== savedSnapshotRef.current);
    if (!nextHistory.present.sections.some((section) => section.sectionId === selectedSectionId)) {
      setSelectedSectionId(nextHistory.present.sections[0]?.sectionId ?? "");
    }
  }

  function commitSections(updater: (current: HomepageSectionConfig[]) => HomepageSectionConfig[]) {
    commitSnapshot((current) => ({ ...current, sections: updater(current.sections) }));
  }

  function commitPhotoPresets(updater: (current: HomepageImagePreset[]) => HomepageImagePreset[]) {
    commitSnapshot((current) => ({ ...current, photoPresets: updater(current.photoPresets) }));
  }

  function commitHeaderNavigation(updater: (current: HeaderNavigationConfig) => HeaderNavigationConfig) {
    commitSnapshot((current) => ({ ...current, headerNavigation: updater(current.headerNavigation) }));
  }

  function commitSeo(patch: Partial<HomepageSeoConfig>) {
    commitSnapshot((current) => ({ ...current, seo: { ...current.seo, ...patch } }));
  }

  function updateSelected(patch: Partial<HomepageSectionConfig>) {
    commitSections((current) => current.map((section) => (section.sectionId === selectedSectionId ? { ...section, ...patch } : section)));
  }

  function openPreviewTarget(target: PreviewEditTarget) {
    setCanvasExpanded(false);
    setSelectedSectionId(target.sectionId);
    setActivePanel(target.panel);
    setSidebarMode("inspector");
    setFocusRequest({ field: target.focus, token: Date.now() });
  }

  function openNavigationTarget(navigationItemId: string) {
    const link = findHeaderNavigationLink(headerNavigation, navigationItemId);
    const targetPage = findEditablePageForHref(link?.href);

    if (targetPage) {
      if (isDirty && !window.confirm("You have unsaved homepage changes. Continue to the linked page editor?")) {
        return;
      }

      router.push(`/admin/homepage?scope=${encodeURIComponent(targetPage.scope)}&id=${encodeURIComponent(targetPage.entityId)}`);
      return;
    }

    setCanvasExpanded(false);
    setSelectedNavigationItemId(navigationItemId);
    setActivePanel("navigation");
    setSidebarMode("inspector");
  }

  function moveSelected(direction: -1 | 1) {
    const currentIndex = sections.findIndex((section) => section.sectionId === selectedSection.sectionId);
    const nextIndex = currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= sections.length) {
      return;
    }

    commitSections((current) => {
      const reordered = [...current];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(nextIndex, 0, moved);

      return reordered.map((section, index) => ({ ...section, sortOrder: (index + 1) * 10 }));
    });
  }

  function reorderSection(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }

    commitSections((current) => {
      const sourceIndex = current.findIndex((section) => section.sectionId === sourceId);
      const targetIndex = current.findIndex((section) => section.sectionId === targetId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      const reordered = [...current];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      return reordered.map((section, index) => ({ ...section, sortOrder: (index + 1) * 10 }));
    });
  }

  function addSectionFromTemplate(template: HomepageSectionTemplate) {
    const sectionId = uniqueSectionId(`home.custom.${template.id}`);
    const nextSection: HomepageSectionConfig = {
      ...template.defaults,
      sectionId,
      isVisible: true,
      sortOrder: nextSortOrder(sections)
    };

    commitSections((current) => withSequentialSortOrder([...current, nextSection]));
    setSelectedSectionId(sectionId);
    setActivePanel("content");
    setSidebarMode("inspector");
  }

  function duplicateSelectedSection() {
    if (!selectedSection) {
      return;
    }

    const sectionId = uniqueSectionId(`${selectedSection.sectionId}.copy`);
    const duplicate: HomepageSectionConfig = {
      ...selectedSection,
      sectionId,
      title: `${selectedSection.title} copy`,
      items: selectedSection.items?.map((item) => ({ ...item, id: uniqueSectionId(`${item.id}.copy`) }))
    };

    commitSections((current) => {
      const selectedIndex = current.findIndex((section) => section.sectionId === selectedSection.sectionId);
      const nextSections = [...current];
      nextSections.splice(selectedIndex + 1, 0, duplicate);

      return withSequentialSortOrder(nextSections);
    });
    setSelectedSectionId(sectionId);
    setActivePanel("content");
  }

  function removeSelectedSection() {
    if (!selectedSection || sections.length <= 1) {
      return;
    }

    if (coreHomepageSectionIds.has(selectedSection.sectionId)) {
      updateSelected({ isVisible: false });
      return;
    }

    const selectedIndex = sections.findIndex((section) => section.sectionId === selectedSection.sectionId);
    const nextSelected = sections[selectedIndex + 1] ?? sections[selectedIndex - 1] ?? sections.find((section) => section.sectionId !== selectedSection.sectionId);

    commitSections((current) => withSequentialSortOrder(current.filter((section) => section.sectionId !== selectedSection.sectionId)));

    if (nextSelected) {
      setSelectedSectionId(nextSelected.sectionId);
    }
  }

  async function submit(operation: "save_draft" | "preview" | "publish") {
    if (operation === "publish" && validation.errors.length > 0) {
      setActivePanel("checks");
      setSaveState({
        tone: "error",
        message: `${validation.errors.length} required ${validation.errors.length === 1 ? "fix" : "fixes"}. Review the Checks panel before publishing.`
      });
      return;
    }

    const submittedSnapshot = editingHistoryRef.current.present;
    setSaveState({ tone: "idle", message: operation === "publish" ? "Publishing..." : "Saving..." });
    const hero = submittedSnapshot.sections.find((section) => section.sectionId === "home.hero") ?? selectedSection;
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        moduleId: "homepage",
        operation,
        values: {
          title: submittedSnapshot.seo.title || hero.title || "Website editor update",
          summary: submittedSnapshot.changeSummary || "Website editor state.",
          ctaLabel: hero.ctaLabel || "",
          ctaHref: hero.ctaHref || "/",
          status: operation === "publish" ? "Visible" : "Draft",
          sectionOrder: submittedSnapshot.sections.map((section) => section.sectionId),
          visualSections: JSON.stringify(submittedSnapshot.sections),
          headerNavigation: JSON.stringify(submittedSnapshot.headerNavigation),
          photoPresets: JSON.stringify(submittedSnapshot.photoPresets),
          seoMetadata: JSON.stringify(submittedSnapshot.seo),
          changeSummary: submittedSnapshot.changeSummary
        }
      })
    }).catch(() => null);

    if (!response) {
      setSaveState({ tone: "error", message: "Could not reach the CMS. Check the local server and try again." });
      return;
    }
    const result = (await response.json()) as AdminOperationResponse;

    if (response.status === 401) {
      setRequiresReauthentication(true);
      setSaveState({ tone: "error", message: "Admin session expired. Sign in again, then return here and publish." });
      return;
    }

    if (!response.ok || !result.ok) {
      const errorMessage = Array.isArray(result.errors) ? result.errors.join(" ") : result.message || result.error || "Could not save.";
      setSaveState({ tone: "error", message: errorMessage });
      return;
    }

    if (result.storage?.persisted === false) {
      setSaveState({ tone: "error", message: result.storage.message ?? "Publish was validated but not persisted." });
      return;
    }

    const savedAt = new Date().toISOString();
    const versionNumber = result.storage?.versionNumber ?? result.version?.versionNumber ?? Date.now();

    setVersions((current) =>
      [
        {
          versionNumber,
          status: result.status ?? (operation === "publish" ? "PUBLISHED" : operation === "preview" ? "PREVIEW" : "DRAFT"),
          title: "Website Editor",
          createdAt: savedAt,
          publishedAt: operation === "publish" ? savedAt : null,
          summary: submittedSnapshot.changeSummary || "Website editor update"
        },
        ...current
      ].slice(0, 12)
    );
    savedSnapshotRef.current = homepageSnapshotSignature(submittedSnapshot);
    setIsDirty(homepageSnapshotSignature(editingHistoryRef.current.present) !== savedSnapshotRef.current);
    setRequiresReauthentication(false);
    setSaveState({
      tone: "success",
      message: operation === "publish"
        ? "Published — these changes are live on the website."
        : operation === "preview"
          ? "Preview saved — these changes are not live."
          : "Draft saved — select Publish when you are ready to make it live."
    });
  }

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f7f7f7] lg:h-screen lg:overflow-hidden">
      <div
        ref={editorRef}
        className={cn(
          "grid min-h-screen w-full max-w-full transition-[grid-template-columns] duration-300 lg:h-full lg:min-h-0 lg:grid-rows-[80px_minmax(0,1fr)]",
          canvasExpanded ? "lg:grid-cols-[0_minmax(0,1fr)]" : "lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[400px_minmax(0,1fr)]"
        )}
        data-hydrated={isHydrated ? "true" : "false"}
        data-store-area="Admin"
        data-store-component="HomepageVisualEditor"
        data-store-section="admin.homepage-visual-editor"
      >
        <aside
          className={cn(
            "min-w-0 border-b border-border bg-surface lg:col-start-1 lg:row-span-2 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r",
            canvasExpanded && "lg:pointer-events-none lg:invisible lg:border-0"
          )}
        >
          <div className="flex h-20 shrink-0 items-center gap-3 border-b border-border px-5">
            <Link aria-label="Back to Admin" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-muted text-secondary transition hover:text-primary" href="/admin">
              <ArrowLeft aria-hidden="true" size={20} />
            </Link>
            <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-md bg-surface-muted px-4">
              <Palette aria-hidden="true" size={18} />
              <span className="truncate font-semibold">Site design</span>
            </div>
          </div>

          <div className="min-h-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto p-5">
            {sidebarMode === "sections" ? (
              <div className="grid gap-5">
                <StorefrontPageSwitcher
                  additionalPages={additionalPages}
                  onBeforeNavigate={() => !isDirty || window.confirm("You have unsaved homepage changes. Continue to another page?")}
                />
                <SectionsPanel
                  addSectionFromTemplate={addSectionFromTemplate}
                  duplicateSelectedSection={duplicateSelectedSection}
                  draggingSectionId={draggingSectionId}
                  moveSelected={moveSelected}
                  onDragEnd={() => setDraggingSectionId(null)}
                  onDragStart={setDraggingSectionId}
                  onDropSection={reorderSection}
                  removeSelectedSection={removeSelectedSection}
                  onSelectSection={(sectionId) => {
                    setSelectedSectionId(sectionId);
                    setActivePanel("content");
                    setSidebarMode("inspector");
                    setFocusRequest({ field: "section", token: Date.now() });
                  }}
                  sections={sections}
                  selectedSection={selectedSection}
                  selectedSectionId={selectedSection.sectionId}
                />
              </div>
            ) : (
              <InspectorPanel
                activePanel={activePanel}
                addPhotoPreset={(preset) => commitPhotoPresets((current) => [...current, preset])}
                changeSummary={changeSummary}
                focusRequest={focusRequest}
                headerNavigation={headerNavigation}
                itemLinkOptions={itemLinkOptions}
                onDone={() => setSidebarMode("sections")}
                onDuplicate={duplicateSelectedSection}
                onRemove={removeSelectedSection}
                photoPresets={photoPresets}
                removePhotoPreset={(presetId) => commitPhotoPresets((current) => (current.length > 1 ? current.filter((preset) => preset.id !== presetId) : current))}
                section={selectedSection}
                selectedNavigationItemId={selectedNavigationItemId}
                seo={seo}
                setActivePanel={setActivePanel}
                setChangeSummary={(summary) => commitSnapshot((current) => ({ ...current, changeSummary: summary }))}
                updatePhotoPreset={(presetId, patch) => commitPhotoPresets((current) => current.map((preset) => (preset.id === presetId ? { ...preset, ...patch } : preset)))}
                updateHeaderNavigation={commitHeaderNavigation}
                updateSection={updateSelected}
                updateSeo={commitSeo}
                validation={validation}
                versions={versions}
              />
            )}
          </div>
        </aside>

        <EditorTopBar
          canRedo={editingHistory.future.length > 0}
          canUndo={editingHistory.past.length > 0}
          canPublish={validation.errors.length === 0}
          canvasExpanded={canvasExpanded}
          isDirty={isDirty}
          onOpenLiveSite={() => window.open("/", "_blank", "noopener,noreferrer")}
          onRedo={redo}
          onPreview={() => setCanvasExpanded((current) => !current)}
          onPublish={() => submit("publish")}
          onSaveDraft={() => submit("save_draft")}
          onUndo={undo}
          previewMode={previewMode}
          requiresReauthentication={requiresReauthentication}
          saveState={saveState}
          setPreviewMode={setPreviewMode}
          validation={validation}
        />

        <section className="min-w-0 p-2 lg:col-start-2 lg:row-start-2 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:p-3">
          <div className="min-h-[720px] flex-1 rounded-[24px] border border-border bg-surface p-3 shadow-sm lg:min-h-0 lg:overflow-hidden">
            <div className="mx-auto h-full w-full overflow-auto rounded-[16px] border border-border bg-surface transition-all" data-preview-frame="true" ref={previewFrameRef}>
              <div className="relative mx-auto" style={{ height: scaledPreviewHeight ? `${scaledPreviewHeight}px` : undefined, width: previewFrameWidth ? `${Math.min(previewFrameWidth, previewDesignWidth)}px` : "100%" }}>
                <div
                  data-preview-canvas="true"
                  ref={previewCanvasRef}
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    width: `${previewDesignWidth}px`
                  }}
                >
                  <StorefrontPreview
                    headerNavigation={headerNavigation}
                    onEditNavigationTarget={openNavigationTarget}
                    onEditTarget={openPreviewTarget}
                    products={previewProducts}
                    sections={visibleSections}
                    selectedSectionId={selectedSection.sectionId}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function EditorTopBar({
  canRedo,
  canUndo,
  canPublish,
  canvasExpanded,
  isDirty,
  onOpenLiveSite,
  onRedo,
  onPreview,
  onPublish,
  onSaveDraft,
  onUndo,
  previewMode,
  requiresReauthentication,
  saveState,
  setPreviewMode,
  validation
}: {
  canRedo: boolean;
  canUndo: boolean;
  canPublish: boolean;
  canvasExpanded: boolean;
  isDirty: boolean;
  onOpenLiveSite: () => void;
  onRedo: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  onUndo: () => void;
  previewMode: PreviewMode;
  requiresReauthentication: boolean;
  saveState: SaveState;
  setPreviewMode: (mode: PreviewMode) => void;
  validation: ValidationResult;
}) {
  return (
    <header className="flex min-h-20 items-center justify-between gap-4 border-b border-border bg-[#f7f7f7] px-5 py-3 lg:col-start-2 lg:row-start-1">
      <div className="flex items-center gap-3">
        <button
          aria-label={canvasExpanded ? "Show editor panel" : "Expand preview"}
          className="grid h-10 w-10 place-items-center rounded-full bg-surface text-secondary shadow-sm transition hover:text-primary"
          onClick={onPreview}
          title={canvasExpanded ? "Show editor panel" : "Expand preview"}
          type="button"
        >
          {canvasExpanded ? <PanelLeftOpen aria-hidden="true" size={18} /> : <PanelLeftClose aria-hidden="true" size={18} />}
        </button>
        <SegmentedPreviewMode previewMode={previewMode} setPreviewMode={setPreviewMode} />
        <div className="inline-flex rounded-full bg-surface-muted p-1">
          <button aria-label="Undo" className="grid h-9 w-9 place-items-center rounded-full text-secondary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35" disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)" type="button">
            <Undo2 aria-hidden="true" size={17} />
          </button>
          <button aria-label="Redo" className="grid h-9 w-9 place-items-center rounded-full text-secondary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35" disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Shift+Z)" type="button">
            <Redo2 aria-hidden="true" size={17} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="hidden xl:block">
          <StatusPill isDirty={isDirty} saveState={saveState} validation={validation} />
        </div>
        {requiresReauthentication ? (
          <Link className="inline-flex h-11 items-center rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-900 transition hover:bg-red-100" href="/admin/login?next=/admin/homepage" rel="noopener noreferrer" target="_blank">
            Sign in again
          </Link>
        ) : null}
        <Button className="h-11 rounded-full px-4" onClick={onSaveDraft} title="Save draft without changing the live website" type="button" variant="quiet">
          <Save aria-hidden="true" size={17} />
          <span className="ml-2">Save draft</span>
        </Button>
        <Button className="h-11 rounded-full px-5" onClick={onPreview} type="button" variant="secondary">
          {canvasExpanded ? "Exit preview" : "Preview"}
        </Button>
        <Button aria-label="Open live site" className="h-11 w-11 rounded-full px-0" onClick={onOpenLiveSite} title="Open the live production site" type="button" variant="quiet">
          <ExternalLink aria-hidden="true" size={17} />
        </Button>
        <Button
          aria-disabled={!canPublish}
          className="h-11 rounded-full bg-primary px-5 text-white hover:bg-primary/90"
          onClick={onPublish}
          title={canPublish ? "Publish homepage" : "Review required fixes before publishing"}
          type="button"
        >
          Publish
        </Button>
      </div>
    </header>
  );
}

function StatusPill({ isDirty, saveState, validation }: { isDirty: boolean; saveState: SaveState; validation: ValidationResult }) {
  if (saveState.tone === "error") {
    return <span className="inline-flex min-h-9 items-center rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-900">{saveState.message}</span>;
  }

  if (validation.errors.length > 0) {
    return <span className="inline-flex min-h-9 items-center rounded-md border border-yellow-200 bg-yellow-50 px-3 text-sm font-semibold text-yellow-900">{validation.errors.length} required {validation.errors.length === 1 ? "fix" : "fixes"}</span>;
  }

  if (saveState.tone === "success") {
    return (
      <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 text-sm font-semibold text-green-900">
        <CheckCircle2 aria-hidden="true" size={16} />
        Saved
      </span>
    );
  }

  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-surface-muted px-3 text-sm font-semibold text-secondary">
      <Clock3 aria-hidden="true" size={16} />
      {isDirty ? "Unsaved changes" : "Ready"}
    </span>
  );
}

function SegmentedPreviewMode({ previewMode, setPreviewMode }: { previewMode: PreviewMode; setPreviewMode: (mode: PreviewMode) => void }) {
  const options: Array<{ id: PreviewMode; label: string; icon: typeof Monitor }> = [
    { id: "desktop", label: "Desktop", icon: Monitor },
    { id: "tablet", label: "Tablet", icon: Tablet },
    { id: "mobile", label: "Mobile", icon: Smartphone }
  ];

  return (
    <div className="inline-flex rounded-md border border-border bg-surface-muted p-1">
      {options.map((option) => {
        const Icon = option.icon;

        return (
          <button
            aria-label={option.label}
            aria-pressed={previewMode === option.id}
            className={cn("flex h-8 w-9 items-center justify-center rounded text-secondary transition hover:text-primary", previewMode === option.id && "bg-surface text-primary shadow-sm")}
            key={option.id}
            onClick={() => setPreviewMode(option.id)}
            title={option.label}
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
          </button>
        );
      })}
    </div>
  );
}

function SectionsPanel({
  addSectionFromTemplate,
  duplicateSelectedSection,
  draggingSectionId,
  moveSelected,
  onDragEnd,
  onDragStart,
  onDropSection,
  removeSelectedSection,
  onSelectSection,
  sections,
  selectedSection,
  selectedSectionId
}: {
  addSectionFromTemplate: (template: HomepageSectionTemplate) => void;
  duplicateSelectedSection: () => void;
  draggingSectionId: string | null;
  moveSelected: (direction: -1 | 1) => void;
  onDragEnd: () => void;
  onDragStart: (sectionId: string) => void;
  onDropSection: (sourceId: string, targetId: string) => void;
  removeSelectedSection: () => void;
  onSelectSection: (sectionId: string) => void;
  sections: HomepageSectionConfig[];
  selectedSection: HomepageSectionConfig;
  selectedSectionId: string;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <aside className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Page structure</p>
          <h2 className="mt-1 text-lg font-semibold">Home sections</h2>
        </div>
        <div className="flex rounded-full bg-surface-muted p-1">
          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface" onClick={() => moveSelected(-1)} title="Move selected section up" type="button"><ArrowUp aria-hidden="true" size={15} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface" onClick={() => moveSelected(1)} title="Move selected section down" type="button"><ArrowDown aria-hidden="true" size={15} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface" onClick={duplicateSelectedSection} title="Duplicate selected section" type="button"><Copy aria-hidden="true" size={15} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface hover:text-red" onClick={removeSelectedSection} title={coreHomepageSectionIds.has(selectedSection.sectionId) ? "Hide selected core section" : "Remove selected section"} type="button"><Trash2 aria-hidden="true" size={15} /></button>
        </div>
      </div>

      <div className="grid gap-2 rounded-md bg-surface-muted p-2">
          {sections.map((section, index) => (
            <button
              aria-pressed={section.sectionId === selectedSectionId}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-md px-3 text-left text-sm transition",
                section.sectionId === selectedSectionId ? "bg-surface text-primary shadow-sm" : "text-primary hover:bg-surface/75",
                draggingSectionId === section.sectionId && "opacity-60"
              )}
              draggable
              key={section.sectionId}
              onClick={() => onSelectSection(section.sectionId)}
              onDragEnd={onDragEnd}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                event.dataTransfer.setData("text/plain", section.sectionId);
                onDragStart(section.sectionId);
              }}
              onDrop={(event: DragEvent<HTMLButtonElement>) => {
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain") || draggingSectionId;

                if (sourceId) {
                  onDropSection(sourceId, section.sectionId);
                }

                onDragEnd();
              }}
              type="button"
            >
              <GripVertical aria-hidden="true" className="shrink-0 text-secondary" size={16} />
              <span className="min-w-0 flex-1 truncate font-semibold">{sectionLabel(section.sectionId)}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-secondary">
                {section.isVisible ? <Eye aria-hidden="true" size={15} /> : <EyeOff aria-hidden="true" size={15} />}
                {index + 1}
              </span>
            </button>
          ))}
      </div>

      <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-surface-muted px-4 text-sm font-semibold transition hover:bg-border" onClick={() => setLibraryOpen((current) => !current)} type="button">
        <Plus aria-hidden="true" size={17} />
        {libraryOpen ? "Close section library" : "Add section"}
      </button>

      {libraryOpen ? (
        <div className="grid gap-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Section library</p>
            {homepageSectionTemplates.map((template) => (
              <button
                className="rounded-md border border-border bg-surface-muted p-3 text-left text-sm transition hover:border-primary hover:text-primary"
                key={template.id}
                onClick={() => {
                  addSectionFromTemplate(template);
                  setLibraryOpen(false);
                }}
                type="button"
              >
                <span className="font-semibold">{template.title}</span>
                <span className="mt-1 block text-xs text-secondary">{template.description}</span>
              </button>
            ))}
        </div>
      ) : null}
    </aside>
  );
}

function StorefrontPreview({
  headerNavigation,
  onEditNavigationTarget,
  onEditTarget,
  products,
  sections,
  selectedSectionId
}: {
  headerNavigation: HeaderNavigationConfig;
  onEditNavigationTarget: (navigationItemId: string) => void;
  onEditTarget: (target: PreviewEditTarget) => void;
  products: StorefrontProduct[];
  sections: HomepageSectionConfig[];
  selectedSectionId: string;
}) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preview = previewRef.current;

    if (!preview) {
      return;
    }

    const scrollContainer = preview.closest<HTMLElement>("[data-preview-frame='true']");
    const previewSections = Array.from(preview.querySelectorAll<HTMLElement>("[data-cms-section-id]"));
    const selectedPreviewSection = previewSections.find((element) => element.dataset.cmsSectionId === selectedSectionId);

    previewSections.forEach((element) => {
      const isSelected = element === selectedPreviewSection;
      element.style.outline = isSelected ? "2px solid var(--color-text-primary)" : "";
      element.style.outlineOffset = isSelected ? "-2px" : "";
    });

    if (selectedSectionId === "home.hero") {
      scrollContainer?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    selectedPreviewSection?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedSectionId]);

  function handlePreviewClick(event: ReactMouseEvent<HTMLDivElement>) {
    const clickedElement = event.target instanceof Element ? event.target : null;
    const navigationElement = clickedElement?.closest<HTMLElement>("[data-header-nav-id]") ?? null;
    const sectionElement = clickedElement?.closest<HTMLElement>("[data-cms-section-id]") ?? null;
    const sectionId = sectionElement?.dataset.cmsSectionId;

    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    if (navigationElement?.dataset.headerNavId) {
      onEditNavigationTarget(navigationElement.dataset.headerNavId);
      return;
    }

    if (!sectionId) {
      return;
    }

    const section = sections.find((candidate) => candidate.sectionId === sectionId);
    const focus = inferPreviewFocus(clickedElement, section);
    onEditTarget({ sectionId, panel: focus === "media" ? "media" : "content", focus });
  }

  return (
    <div className="bg-background text-primary" onClickCapture={handlePreviewClick} ref={previewRef}>
      <SiteHeader navigation={headerNavigation} />
      <HomePageTemplate products={products} sections={sections} />
      <SiteFooter />
    </div>
  );
}

function inferPreviewFocus(target: Element | null, section?: HomepageSectionConfig): EditorFocus {
  if (!target) {
    return "section";
  }

  if (target.closest("[data-store-component='ProductCard']")) {
    return "items";
  }

  const clickedText = target.textContent?.trim().toLowerCase() ?? "";
  const clickedLink = target.closest("a,button");

  if (clickedLink && section?.items?.some((item) => clickedText.includes(item.title.toLowerCase()))) {
    return "items";
  }

  if (target.closest("img,picture")) {
    return "media";
  }

  if (target.closest("h1,h2,h3,h4")) {
    return "title";
  }

  if (target.closest("p")) {
    return "body";
  }

  if (clickedLink) {
    if (clickedText.includes("shop all") || clickedText.includes("category") || clickedText.includes("brand")) {
      return "items";
    }

    return "ctaLabel";
  }

  return "section";
}

function findHeaderNavigationLink(navigation: HeaderNavigationConfig, navigationItemId: string) {
  if (navigation.mobileCta.id === navigationItemId) {
    return navigation.mobileCta;
  }

  return [...navigation.primary, ...navigation.utility].find((link) => link.id === navigationItemId);
}

function findEditablePageForHref(href?: string) {
  if (!href) {
    return undefined;
  }

  const normalizedHref = normalizeInternalPath(href);

  if (!normalizedHref) {
    return undefined;
  }

  return storefrontEditablePages.find((page) => normalizeInternalPath(page.route) === normalizedHref);
}

function normalizeInternalPath(href: string) {
  if (!href.startsWith("/")) {
    return "";
  }

  const path = href.split(/[?#]/)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function InspectorPanel({
  activePanel,
  section,
  updateSection,
  headerNavigation,
  itemLinkOptions,
  updateHeaderNavigation,
  selectedNavigationItemId,
  photoPresets,
  addPhotoPreset,
  updatePhotoPreset,
  removePhotoPreset,
  seo,
  updateSeo,
  validation,
  versions,
  changeSummary,
  focusRequest,
  onDone,
  onDuplicate,
  onRemove,
  setChangeSummary,
  setActivePanel
}: {
  activePanel: EditorPanel;
  section: HomepageSectionConfig;
  updateSection: (patch: Partial<HomepageSectionConfig>) => void;
  headerNavigation: HeaderNavigationConfig;
  itemLinkOptions: HomepageItemLinkOption[];
  updateHeaderNavigation: (updater: (current: HeaderNavigationConfig) => HeaderNavigationConfig) => void;
  selectedNavigationItemId: string;
  photoPresets: HomepageImagePreset[];
  addPhotoPreset: (preset: HomepageImagePreset) => void;
  updatePhotoPreset: (presetId: string, patch: Partial<HomepageImagePreset>) => void;
  removePhotoPreset: (presetId: string) => void;
  seo: HomepageSeoConfig;
  updateSeo: (patch: Partial<HomepageSeoConfig>) => void;
  validation: ValidationResult;
  versions: HomepageVersionSummary[];
  changeSummary: string;
  focusRequest: EditorFocusRequest | null;
  onDone: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  setChangeSummary: (summary: string) => void;
  setActivePanel: (panel: EditorPanel) => void;
}) {
  const inspectorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    inspectorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusRequest]);

  const inspectorTitle =
    activePanel === "navigation"
      ? "Header navigation"
      : activePanel === "seo"
        ? "Homepage SEO"
        : activePanel === "history"
          ? "Version history"
          : sectionLabel(section.sectionId);

  return (
    <aside className="min-h-0 w-full min-w-0 max-w-full" ref={inspectorRef}>
      <div className="sticky top-0 z-20 -mx-5 -mt-5 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate font-display text-lg font-semibold">{inspectorTitle}</h2>
          <Button className="h-10 shrink-0 rounded-full px-4" onClick={onDone} variant="quiet">
            Done
          </Button>
        </div>
      </div>

      <div className="my-4 grid grid-cols-4 gap-1">
        {panelTabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activePanel === tab.id;

          return (
            <button
              aria-pressed={selected}
              className={cn(
                "inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-semibold transition",
                selected ? "bg-primary text-white" : "bg-surface-muted text-secondary hover:text-primary"
              )}
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              type="button"
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activePanel === "content" ? <ContentPanel focusRequest={focusRequest} itemLinkOptions={itemLinkOptions} section={section} setActivePanel={setActivePanel} updateSection={updateSection} /> : null}
      {activePanel === "design" ? <DesignPanel focusRequest={focusRequest} section={section} updateSection={updateSection} /> : null}
      {activePanel === "media" ? (
        <MediaPanel
          addPhotoPreset={addPhotoPreset}
          focusRequest={focusRequest}
          photoPresets={photoPresets}
          removePhotoPreset={removePhotoPreset}
          section={section}
          updatePhotoPreset={updatePhotoPreset}
          updateSection={updateSection}
        />
      ) : null}
      {activePanel === "navigation" ? <NavigationPanel navigation={headerNavigation} selectedNavigationItemId={selectedNavigationItemId} updateNavigation={updateHeaderNavigation} /> : null}
      {activePanel === "seo" ? <SeoPanel seo={seo} updateSeo={updateSeo} /> : null}
      {activePanel === "checks" ? <ChecksPanel changeSummary={changeSummary} setChangeSummary={setChangeSummary} validation={validation} /> : null}
      {activePanel === "history" ? <HistoryPanel versions={versions} /> : null}

      <div className="mt-6 grid grid-cols-2 gap-2 border-t border-border pt-4">
        <Button className="justify-center" onClick={onDuplicate} variant="quiet">
          <Copy aria-hidden="true" className="size-4" />
          Duplicate
        </Button>
        <Button className="justify-center" onClick={onRemove} variant="quiet">
          <Trash2 aria-hidden="true" className="size-4" />
          Remove
        </Button>
      </div>
    </aside>
  );
}

type HeaderNavigationGroup = "primary" | "utility";

function NavigationPanel({
  navigation,
  selectedNavigationItemId,
  updateNavigation
}: {
  navigation: HeaderNavigationConfig;
  selectedNavigationItemId: string;
  updateNavigation: (updater: (current: HeaderNavigationConfig) => HeaderNavigationConfig) => void;
}) {
  function updateLink(group: HeaderNavigationGroup, linkId: string, patch: Partial<HeaderNavigationLink>) {
    updateNavigation((current) => ({
      ...current,
      [group]: current[group].map((link) => (link.id === linkId ? { ...link, ...patch } : link))
    }));
  }

  function moveLink(group: HeaderNavigationGroup, linkId: string, direction: -1 | 1) {
    updateNavigation((current) => {
      const links = [...current[group]];
      const index = links.findIndex((link) => link.id === linkId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= links.length) {
        return current;
      }

      const [moved] = links.splice(index, 1);
      links.splice(nextIndex, 0, moved);

      return {
        ...current,
        [group]: links
      };
    });
  }

  function addLink(group: HeaderNavigationGroup) {
    updateNavigation((current) => ({
      ...current,
      [group]: [
        ...current[group],
        {
          id: uniqueSectionId(`header-${group}`),
          label: "New link",
          href: "/shop",
          visible: true
        }
      ]
    }));
  }

  function removeLink(group: HeaderNavigationGroup, linkId: string) {
    updateNavigation((current) => ({
      ...current,
      [group]: current[group].length > 1 ? current[group].filter((link) => link.id !== linkId) : current[group]
    }));
  }

  function updateMobileCta(patch: Partial<HeaderNavigationLink>) {
    updateNavigation((current) => ({
      ...current,
      mobileCta: {
        ...current.mobileCta,
        ...patch
      }
    }));
  }

  return (
    <div className="grid min-w-0 gap-4">
      <NavigationGroupEditor
        group="primary"
        label="Main header links"
        links={navigation.primary}
        onAdd={() => addLink("primary")}
        onMove={moveLink}
        onRemove={removeLink}
        onUpdate={updateLink}
        selectedNavigationItemId={selectedNavigationItemId}
      />
      <NavigationGroupEditor
        group="utility"
        label="Header icons"
        links={navigation.utility}
        onAdd={() => addLink("utility")}
        onMove={moveLink}
        onRemove={removeLink}
        onUpdate={updateLink}
        selectedNavigationItemId={selectedNavigationItemId}
      />
      <div className={cn("grid gap-3 rounded-md border bg-surface-muted p-3", selectedNavigationItemId === navigation.mobileCta.id ? "border-primary" : "border-border")}>
        <div>
          <p className="text-sm font-semibold">Mobile CTA</p>
          <p className="mt-1 text-xs text-secondary">Small yellow button shown when the full nav collapses.</p>
        </div>
        <ToggleRow checked={navigation.mobileCta.visible} label="Visible" onChange={(visible) => updateMobileCta({ visible })} />
        <TextField label="Label" onChange={(label) => updateMobileCta({ label })} value={navigation.mobileCta.label} />
        <TextField label="Link" onChange={(href) => updateMobileCta({ href })} value={navigation.mobileCta.href} />
      </div>
    </div>
  );
}

function NavigationGroupEditor({
  group,
  label,
  links,
  onAdd,
  onMove,
  onRemove,
  onUpdate,
  selectedNavigationItemId
}: {
  group: HeaderNavigationGroup;
  label: string;
  links: HeaderNavigationLink[];
  onAdd: () => void;
  onMove: (group: HeaderNavigationGroup, linkId: string, direction: -1 | 1) => void;
  onRemove: (group: HeaderNavigationGroup, linkId: string) => void;
  onUpdate: (group: HeaderNavigationGroup, linkId: string, patch: Partial<HeaderNavigationLink>) => void;
  selectedNavigationItemId: string;
}) {
  return (
    <section className="grid gap-3 rounded-md border border-border bg-surface-muted p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-secondary">Click a link in the preview to jump here.</p>
        </div>
        <Button className="h-9 gap-2 px-3 text-xs" onClick={onAdd} type="button" variant="secondary">
          <Plus aria-hidden="true" size={15} />
          Add
        </Button>
      </div>

      <div className="grid gap-3">
        {links.map((link, index) => (
          <NavigationLinkEditor
            group={group}
            index={index}
            isSelected={selectedNavigationItemId === link.id}
            key={link.id}
            link={link}
            onMove={onMove}
            onRemove={onRemove}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </section>
  );
}

function NavigationLinkEditor({
  group,
  index,
  isSelected,
  link,
  onMove,
  onRemove,
  onUpdate
}: {
  group: HeaderNavigationGroup;
  index: number;
  isSelected: boolean;
  link: HeaderNavigationLink;
  onMove: (group: HeaderNavigationGroup, linkId: string, direction: -1 | 1) => void;
  onRemove: (group: HeaderNavigationGroup, linkId: string) => void;
  onUpdate: (group: HeaderNavigationGroup, linkId: string, patch: Partial<HeaderNavigationLink>) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isSelected) {
      cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [isSelected]);

  return (
    <article className={cn("grid gap-2 rounded-md border bg-surface p-3", isSelected ? "border-primary" : "border-border")} ref={cardRef}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">
          {group === "primary" ? "Nav" : "Icon"} {index + 1}
        </p>
        <div className="flex gap-1">
          <Button className="h-8 w-8 px-0" onClick={() => onMove(group, link.id, -1)} title="Move up" type="button" variant="quiet">
            <ArrowUp aria-hidden="true" size={15} />
          </Button>
          <Button className="h-8 w-8 px-0" onClick={() => onMove(group, link.id, 1)} title="Move down" type="button" variant="quiet">
            <ArrowDown aria-hidden="true" size={15} />
          </Button>
          <Button className="h-8 px-2 text-xs" onClick={() => onRemove(group, link.id)} type="button" variant="quiet">
            Remove
          </Button>
        </div>
      </div>
      <ToggleRow checked={link.visible} label="Visible" onChange={(visible) => onUpdate(group, link.id, { visible })} />
      <TextField label="Label" onChange={(label) => onUpdate(group, link.id, { label })} value={link.label} />
      <TextField label="Link" onChange={(href) => onUpdate(group, link.id, { href })} value={link.href} />
    </article>
  );
}

function ContentPanel({
  section,
  itemLinkOptions,
  setActivePanel,
  updateSection,
  focusRequest
}: {
  section: HomepageSectionConfig;
  itemLinkOptions: HomepageItemLinkOption[];
  setActivePanel: (panel: EditorPanel) => void;
  updateSection: (patch: Partial<HomepageSectionConfig>) => void;
  focusRequest: EditorFocusRequest | null;
}) {
  const isHero = sectionTypeFromSection(section) === "hero";

  return (
    <div className="grid gap-4">
      <ToggleRow checked={section.isVisible} label="Visible" onChange={(isVisible) => updateSection({ isVisible })} />
      <div className="grid gap-2 rounded-md border border-border bg-surface-muted p-3">
        <div>
          <p className="text-sm font-semibold">Show or hide parts</p>
          <p className="mt-1 text-xs text-secondary">Hide an element without deleting its text.</p>
        </div>
        <ToggleRow checked={isSectionElementVisible(section, "eyebrow")} label="Show eyebrow" onChange={(checked) => updateSection({ hiddenElements: setSectionElementVisibility(section, "eyebrow", checked) })} />
        <ToggleRow checked={isSectionElementVisible(section, "title")} label="Show title" onChange={(checked) => updateSection({ hiddenElements: setSectionElementVisibility(section, "title", checked) })} />
        <ToggleRow checked={isSectionElementVisible(section, "body")} label="Show body" onChange={(checked) => updateSection({ hiddenElements: setSectionElementVisibility(section, "body", checked) })} />
        <ToggleRow checked={isSectionElementVisible(section, "primaryCta")} label="Show main button" onChange={(checked) => updateSection({ hiddenElements: setSectionElementVisibility(section, "primaryCta", checked) })} />
        {isHero ? <ToggleRow checked={isSectionElementVisible(section, "secondaryCta")} label="Show secondary button" onChange={(checked) => updateSection({ hiddenElements: setSectionElementVisibility(section, "secondaryCta", checked) })} /> : null}
        <ToggleRow checked={isSectionElementVisible(section, "items")} label={isHero ? "Show category tiles" : "Show cards/items"} onChange={(checked) => updateSection({ hiddenElements: setSectionElementVisibility(section, "items", checked) })} />
      </div>
      <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
        <p className="font-semibold">Section type</p>
        <p className="mt-1 text-xs text-secondary">{section.sectionType ?? sectionTypeFromSection(section)}</p>
      </div>
      <TextField fieldId="eyebrow" focusRequest={focusRequest} label="Eyebrow" onChange={(eyebrow) => updateSection({ eyebrow })} value={section.eyebrow ?? ""} />
      <TextField fieldId="title" focusRequest={focusRequest} label="Title" onChange={(title) => updateSection({ title })} value={section.title} />
      <TextArea fieldId="body" focusRequest={focusRequest} label="Body" onChange={(body) => updateSection({ body })} value={section.body} />
      <div className="grid gap-3 rounded-md border border-border bg-surface-muted p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 aria-hidden="true" size={16} />
          Main button
        </div>
        <TextField fieldId="ctaLabel" focusRequest={focusRequest} label="Button label" onChange={(ctaLabel) => updateSection({ ctaLabel })} value={section.ctaLabel ?? ""} />
        <ButtonDestinationEditor fieldId="ctaHref" focusRequest={focusRequest} href={section.ctaHref ?? ""} linkOptions={itemLinkOptions} onChange={(ctaHref) => updateSection({ ctaHref })} />
      </div>
      {isHero ? (
        <div className="grid gap-3 rounded-md border border-border bg-surface-muted p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Link2 aria-hidden="true" size={16} />
            Secondary hero button
          </div>
          <TextField label="Button label" onChange={(secondaryCtaLabel) => updateSection({ secondaryCtaLabel })} value={section.secondaryCtaLabel ?? (section.variant === "back-to-school" ? "Build a School Kit" : "Balloon order")} />
          <ButtonDestinationEditor href={section.secondaryCtaHref ?? (section.variant === "back-to-school" ? "/stationery" : "/balloons")} linkOptions={itemLinkOptions} onChange={(secondaryCtaHref) => updateSection({ secondaryCtaHref })} />
        </div>
      ) : null}
      <Button className="gap-2" onClick={() => setActivePanel("media")} type="button" variant="secondary">
        <ImageIcon aria-hidden="true" size={16} />
        Edit image
      </Button>
      <SectionItemsEditor focusRequest={focusRequest} itemLinkOptions={itemLinkOptions} section={section} updateSection={updateSection} />
    </div>
  );
}

function SectionItemsEditor({ section, updateSection, focusRequest, itemLinkOptions }: { section: HomepageSectionConfig; updateSection: (patch: Partial<HomepageSectionConfig>) => void; focusRequest: EditorFocusRequest | null; itemLinkOptions: HomepageItemLinkOption[] }) {
  const itemsRef = useRef<HTMLElement>(null);
  const [itemUploadStates, setItemUploadStates] = useState<Record<string, SaveState>>({});
  const storedItems = section.items ?? [];
  const defaultItems = defaultEditableItemsForSection(section);
  const items = storedItems.length > 0 ? storedItems : defaultItems;
  const isHeroCards = section.sectionId === "home.hero";
  const supportsItems = ["departments", "feature-grid", "split-media", "trust-bar", "faq", "promo", "content", "image-banner", "newsletter"].includes(sectionTypeFromSection(section)) || defaultItems.length > 0;

  useEffect(() => {
    if (focusRequest?.field === "items") {
      itemsRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusRequest]);

  if (!supportsItems && items.length === 0) {
    return null;
  }

  function updateItems(nextItems: HomepageSectionItem[]) {
    updateSection({ items: nextItems });
  }

  function addItem() {
    if (isHeroCards && items.length >= 4) return;
    updateItems([
      ...items,
      {
        id: uniqueSectionId("item"),
        label: isHeroCards ? `0${items.length + 1} Card` : undefined,
        title: `Item ${items.length + 1}`,
        body: "Editable item copy.",
        href: isHeroCards ? "/shop" : undefined,
        linkType: isHeroCards ? "manual" : undefined,
        tone: isHeroCards ? (["yellow", "cyan", "green", "red"][items.length] as HomepageSectionItem["tone"]) : undefined
      }
    ]);
  }

  function updateItem(itemId: string, patch: Partial<HomepageSectionItem>) {
    updateItems(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeItem(itemId: string) {
    updateItems(items.filter((item) => item.id !== itemId));
  }

  async function uploadItemImage(item: HomepageSectionItem, file: File) {
    setItemUploadStates((current) => ({
      ...current,
      [item.id]: {
        tone: "idle",
        message: "Uploading image..."
      }
    }));

    try {
      const asset = await uploadAdminImage(file, `${section.sectionId}-${item.id}`);
      updateItem(item.id, {
        image: asset.url,
        imageAlt: item.imageAlt || labelFromFileName(asset.originalName) || item.title
      });
      setItemUploadStates((current) => ({
        ...current,
        [item.id]: {
          tone: "success",
          message: `Uploaded ${asset.originalName}.`
        }
      }));
    } catch (error) {
      setItemUploadStates((current) => ({
        ...current,
        [item.id]: {
          tone: "error",
          message: error instanceof Error ? error.message : "Image upload failed."
        }
      }));
    }
  }

  return (
    <section className="grid gap-3 rounded-md border border-border bg-surface-muted p-3" ref={itemsRef}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{isHeroCards ? "Homepage promotional cards" : "Editable items"}</p>
          <p className="mt-1 text-xs text-secondary">{isHeroCards ? "Edit these four cards and send each one to a brand, category, product, or manual link." : "Cards, FAQ rows, badges, or support points for this section."}</p>
        </div>
        {!isHeroCards || items.length < 4 ? (
          <Button className="h-9 gap-2 px-3 text-xs" onClick={addItem} type="button" variant="secondary">
            <Plus aria-hidden="true" size={15} />
            Add
          </Button>
        ) : null}
      </div>

      {storedItems.length === 0 && items.length > 0 ? <div className="rounded-md border border-border bg-surface p-3 text-xs text-secondary">Default cards are ready to edit. Uploading or changing any card will save this section as editable storefront content.</div> : null}
      {items.length === 0 ? <div className="rounded-md border border-dashed border-border bg-surface p-3 text-sm text-secondary">No items yet.</div> : null}

      <div className="grid gap-3">
        {items.map((item, index) => {
          const isCutout = isHeroCards && item.presentation === "cutout";

          return (
            <article className="grid min-w-0 gap-2 rounded-md border border-border bg-surface p-3" key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{isHeroCards ? "Card" : "Item"} {index + 1}</p>
              {!isHeroCards ? <Button className="h-8 px-2 text-xs" onClick={() => removeItem(item.id)} type="button" variant="quiet">Remove</Button> : null}
            </div>
            <ItemDestinationEditor
              item={item}
              linkOptions={itemLinkOptions}
              onManualHref={(href) => updateItem(item.id, { href, linkType: "manual", linkValue: undefined, productSlug: undefined, squareVariationId: undefined })}
              onSelect={(option) => updateItem(item.id, {
                linkType: option.type,
                linkValue: option.value,
                href: option.href,
                title: option.title,
                body: option.body ?? item.body,
                image: option.image ?? item.image,
                imageAlt: option.imageAlt ?? item.imageAlt,
                productSlug: option.productSlug,
                squareVariationId: option.squareVariationId
              })}
              onTypeChange={(linkType) => updateItem(item.id, {
                linkType,
                linkValue: undefined,
                productSlug: linkType === "product" ? item.productSlug : undefined,
                squareVariationId: linkType === "product" ? item.squareVariationId : undefined
              })}
            />
            {isHeroCards ? <SelectField label="Presentation" onChange={(presentation) => updateItem(item.id, { presentation: presentation as HomepageItemPresentation })} options={["card", "cutout"]} value={item.presentation ?? "card"} /> : null}
            {isCutout ? (
              <div className="rounded-md border border-cyan/50 bg-cyan/10 p-3 text-xs leading-relaxed text-secondary">
                Only the clickable image will appear. For a true cutout, upload a transparent PNG or WebP. The accessible label below remains available to screen readers.
              </div>
            ) : <TextField label="Label" onChange={(label) => updateItem(item.id, { label })} value={item.label ?? ""} />}
            <TextField label={isCutout ? "Accessible label" : "Title"} onChange={(title) => updateItem(item.id, { title })} value={item.title} />
            {!isCutout ? <TextArea label="Body" onChange={(body) => updateItem(item.id, { body })} rows={3} value={item.body ?? ""} /> : null}
            {isHeroCards && !isCutout ? <SelectField label="Card color" onChange={(tone) => updateItem(item.id, { tone: tone as HomepageSectionItem["tone"] })} options={["yellow", "cyan", "green", "red", "white"]} value={item.tone ?? ["yellow", "cyan", "green", "red"][index % 4]} /> : null}
            {!isCutout ? <TextField label="Badge" onChange={(badge) => updateItem(item.id, { badge })} value={item.badge ?? ""} /> : null}
            <div className="grid gap-2 rounded-md border border-border bg-surface-muted p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{isCutout ? "Cutout image" : "Card image"}</p>
              <EditablePresetImage alt={item.imageAlt || item.title} className={cn("aspect-[4/3] rounded-md border border-border", isCutout && "bg-transparent object-contain p-3")} src={item.image || ""} />
              <div className="flex flex-wrap gap-2">
                <ImageUploadControl className="h-8 min-h-8 px-2" id={`item-image-upload-${safeDomId(section.sectionId)}-${safeDomId(item.id)}`} label="Upload" onUpload={(file) => uploadItemImage(item, file)} />
                <Button className="h-8 min-h-8 px-2 text-xs" onClick={() => updateItem(item.id, { image: section.backgroundImage || defaultHomepageImage, imageAlt: item.imageAlt || item.title })} type="button" variant="secondary">
                  Use fallback
                </Button>
                {item.image ? (
                  <Button className="h-8 min-h-8 px-2 text-xs" onClick={() => updateItem(item.id, { image: "", imageAlt: "" })} type="button" variant="quiet">
                    Clear
                  </Button>
                ) : null}
              </div>
              <UploadStatus state={itemUploadStates[item.id] ?? { tone: "idle", message: "" }} />
              <ImageUrlField compact label={`Item ${index + 1} image URL`} onApply={(image) => updateItem(item.id, { image })} value={item.image ?? ""} />
              <TextField label="Image alt text" onChange={(imageAlt) => updateItem(item.id, { imageAlt })} value={item.imageAlt ?? ""} />
            </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ItemDestinationEditor({ item, linkOptions, onManualHref, onSelect, onTypeChange }: { item: HomepageSectionItem; linkOptions: HomepageItemLinkOption[]; onManualHref: (href: string) => void; onSelect: (option: HomepageItemLinkOption) => void; onTypeChange: (type: HomepageItemLinkType) => void }) {
  const linkType = inferHomepageItemLinkType(item);
  const options = linkOptions.filter((option) => option.type === linkType);
  const inferredValue = item.linkValue || inferHomepageItemLinkValue(item, linkType);
  const matchedOption = options.find((option) => option.value === inferredValue) ?? options.find((option) => option.href === item.href);

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-muted p-3">
      <label className="grid gap-1 text-xs font-semibold">
        <span>Destination type</span>
        <select className="min-h-9 w-full min-w-0 max-w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-normal outline-none focus:border-primary" onChange={(event) => onTypeChange(event.currentTarget.value as HomepageItemLinkType)} value={linkType}>
          <option value="manual">Manual link</option>
          <option value="page">Page</option>
          <option value="brand">Brand</option>
          <option value="category">Category</option>
          <option value="product">Product</option>
        </select>
      </label>
      {linkType === "manual" ? <TextField label="Link" onChange={onManualHref} value={item.href ?? ""} /> : (
        <label className="grid gap-1 text-xs font-semibold">
          <span>{`Choose ${linkType}`}</span>
          <select className="min-h-9 w-full min-w-0 max-w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-normal outline-none focus:border-primary" onChange={(event) => { const selected = options.find((option) => option.value === event.currentTarget.value); if (selected) onSelect(selected); }} value={matchedOption?.value ?? ""}>
            <option value="">Select...</option>
            {options.map((option) => <option key={`${option.type}:${option.value}`} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      )}
      {linkType !== "manual" && options.length === 0 ? <p className="text-xs text-secondary">No published {linkType} destinations are available yet.</p> : null}
      {matchedOption ? <p className="text-xs text-secondary">Links to {matchedOption.href}</p> : null}
    </div>
  );
}

function ButtonDestinationEditor({ fieldId, focusRequest, href, linkOptions, onChange }: { fieldId?: EditorFocus; focusRequest?: EditorFocusRequest | null; href: string; linkOptions: HomepageItemLinkOption[]; onChange: (href: string) => void }) {
  const matchedOption = linkOptions.find((option) => option.href === href);
  const [manualMode, setManualMode] = useState(!matchedOption);
  const selectRef = useRef<HTMLSelectElement>(null);
  const groups: Array<{ label: string; type: HomepageItemLinkOption["type"] }> = [
    { label: "Pages and campaigns", type: "page" },
    { label: "Brands", type: "brand" },
    { label: "Categories", type: "category" },
    { label: "Products", type: "product" }
  ];

  useEffect(() => {
    if (fieldId && focusRequest?.field === fieldId) {
      selectRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      selectRef.current?.focus();
    }
  }, [fieldId, focusRequest]);

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs font-semibold">
        <span>Button destination</span>
        <select
          className="min-h-10 w-full min-w-0 max-w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary"
          onChange={(event) => {
            if (event.currentTarget.value === "__manual__") {
              setManualMode(true);
              return;
            }

            const selected = linkOptions.find((option) => `${option.type}:${option.value}` === event.currentTarget.value);
            if (selected) {
              setManualMode(false);
              onChange(selected.href);
            }
          }}
          ref={selectRef}
          value={!manualMode && matchedOption ? `${matchedOption.type}:${matchedOption.value}` : "__manual__"}
        >
          <option value="__manual__">Custom link</option>
          {groups.map((group) => {
            const options = linkOptions.filter((option) => option.type === group.type);
            return options.length > 0 ? (
              <optgroup key={group.type} label={group.label}>
                {options.map((option) => <option key={`${option.type}:${option.value}`} value={`${option.type}:${option.value}`}>{option.label}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
      </label>
      {manualMode || !matchedOption ? <TextField fieldId={fieldId} focusRequest={focusRequest} label="Custom link" onChange={onChange} value={href} /> : <p className="text-xs text-secondary">Links to {href}</p>}
      <p className="text-xs text-secondary">New catalog brands, categories, and products will appear here automatically.</p>
    </div>
  );
}

function DesignPanel({ section, updateSection, focusRequest }: { section: HomepageSectionConfig; updateSection: (patch: Partial<HomepageSectionConfig>) => void; focusRequest: EditorFocusRequest | null }) {
  const isHero = sectionTypeFromSection(section) === "hero";
  const heroLayoutOptions = [
    { value: "seasonal-card", label: "Seasonal card (editable)" },
    { value: "back-to-school", label: "Full image with centered text" },
    { value: "default", label: "Classic image hero" }
  ];

  if (isHero && !heroLayoutOptions.some((option) => option.value === section.variant)) {
    heroLayoutOptions.push({ value: section.variant, label: `Current layout (${section.variant})` });
  }

  return (
    <div className="grid gap-4">
      {isHero ? (
        <SelectField
          label="Hero layout"
          onChange={(variant) => updateSection(variant === "seasonal-card"
            ? {
                variant,
                textPosition: "left",
                mediaPlacement: "background",
                backgroundTone: "dark",
                heroSize: "compact",
                hiddenElements: setSectionElementVisibility(section, "secondaryCta", false)
              }
            : { variant })}
          options={heroLayoutOptions}
          value={section.variant}
        />
      ) : null}
      <SelectField fieldId="textPosition" focusRequest={focusRequest} label="Text position" onChange={(textPosition) => updateSection({ textPosition: textPosition as HomepageSectionConfig["textPosition"] })} options={["left", "center", "right"]} value={section.textPosition ?? "left"} />
      <SelectField fieldId="mediaPlacement" focusRequest={focusRequest} label="Photo placement" onChange={(mediaPlacement) => updateSection({ mediaPlacement: mediaPlacement as HomepageSectionConfig["mediaPlacement"] })} options={["background", "left", "right", "none"]} value={section.mediaPlacement ?? "none"} />
      <SelectField label="Placeholder layout" onChange={(placeholderLayout) => updateSection({ placeholderLayout: placeholderLayout as HomepageSectionConfig["placeholderLayout"] })} options={["grid", "split", "rail", "stack"]} value={section.placeholderLayout ?? "grid"} />
      <SelectField fieldId="backgroundTone" focusRequest={focusRequest} label="Background" onChange={(backgroundTone) => updateSection({ backgroundTone: backgroundTone as HomepageSectionConfig["backgroundTone"] })} options={["default", "muted", "brand", "dark", "accent"]} value={section.backgroundTone ?? "default"} />
      <SelectField fieldId="contentWidth" focusRequest={focusRequest} label="Content width" onChange={(contentWidth) => updateSection({ contentWidth: contentWidth as HomepageSectionConfig["contentWidth"] })} options={["narrow", "normal", "wide"]} value={section.contentWidth ?? "wide"} />
      <SelectField fieldId="verticalPadding" focusRequest={focusRequest} label="Spacing" onChange={(verticalPadding) => updateSection({ verticalPadding: verticalPadding as HomepageSectionConfig["verticalPadding"] })} options={["compact", "normal", "spacious"]} value={section.verticalPadding ?? "normal"} />
      {isHero ? <SelectField fieldId="heroSize" focusRequest={focusRequest} label="Hero size" onChange={(heroSize) => updateSection({ heroSize: heroSize as HomepageHeroSize })} options={["compact", "standard", "large", "fullscreen"]} value={section.heroSize ?? "large"} /> : null}
      <SelectField fieldId="columns" focusRequest={focusRequest} label="Columns" onChange={(columns) => updateSection({ columns: Number(columns) as HomepageSectionConfig["columns"] })} options={["2", "3", "4"]} value={String(section.columns ?? 3)} />
      <div className="rounded-md border border-border bg-surface-muted p-3">
        <p className="text-sm font-semibold">Production-safe styling</p>
        <p className="mt-1 text-xs text-secondary">The editor exposes approved layout tokens instead of arbitrary CSS, so staff can change the site without breaking checkout or mobile layout.</p>
      </div>
    </div>
  );
}

function MediaPanel({
  section,
  updateSection,
  photoPresets,
  addPhotoPreset,
  updatePhotoPreset,
  removePhotoPreset,
  focusRequest
}: {
  section: HomepageSectionConfig;
  updateSection: (patch: Partial<HomepageSectionConfig>) => void;
  photoPresets: HomepageImagePreset[];
  addPhotoPreset: (preset: HomepageImagePreset) => void;
  updatePhotoPreset: (presetId: string, patch: Partial<HomepageImagePreset>) => void;
  removePhotoPreset: (presetId: string) => void;
  focusRequest: EditorFocusRequest | null;
}) {
  const [sectionUploadState, setSectionUploadState] = useState<SaveState>({ tone: "idle", message: "" });

  function addCurrentPhotoAsPreset() {
    const nextIndex = photoPresets.length + 1;
    addPhotoPreset({
      id: `custom-${Date.now()}`,
      label: `Custom ${nextIndex}`,
      url: section.backgroundImage || defaultHomepageImage
    });
  }

  async function uploadSectionImage(file: File) {
    setSectionUploadState({ tone: "idle", message: "Uploading image..." });

    try {
      const asset = await uploadAdminImage(file, section.sectionId);
      updateSection({ backgroundImage: asset.url, mediaPlacement: "background" });
      setSectionUploadState({ tone: "success", message: `Uploaded ${asset.originalName}.` });
    } catch (error) {
      setSectionUploadState({ tone: "error", message: error instanceof Error ? error.message : "Image upload failed." });
    }
  }

  return (
    <div className="grid gap-4">
      <ImageUrlField fieldId="media" focusRequest={focusRequest} label="Photo URL" onApply={(backgroundImage) => updateSection({ backgroundImage, mediaPlacement: "background" })} value={section.backgroundImage ?? ""} />
      <TextField fieldId="imageAlt" focusRequest={focusRequest} label="Image alt text" onChange={(imageAlt) => updateSection({ imageAlt })} value={section.imageAlt ?? ""} />
      <div className="grid gap-2 rounded-md border border-border bg-surface-muted p-3">
        <p className="text-sm font-semibold">Current image</p>
        <EditablePresetImage alt={section.imageAlt || `${sectionLabel(section.sectionId)} image`} className="h-28 rounded-md border border-border" src={section.backgroundImage || defaultHomepageImage} />
        <ImageUploadControl id={`section-image-upload-${section.sectionId}`} label="Upload section image" onUpload={uploadSectionImage} />
        <UploadStatus state={sectionUploadState} />
      </div>

      <PhotoPresetEditor
        addCurrentPhotoAsPreset={addCurrentPhotoAsPreset}
        addPhotoPreset={addPhotoPreset}
        photoPresets={photoPresets}
        removePhotoPreset={removePhotoPreset}
        selectPhoto={(imageUrl) => updateSection({ backgroundImage: imageUrl || defaultHomepageImage, mediaPlacement: "background" })}
        updatePhotoPreset={updatePhotoPreset}
        useFallback={() => updateSection({ backgroundImage: defaultHomepageImage, mediaPlacement: "background" })}
      />
    </div>
  );
}

function SeoPanel({ seo, updateSeo }: { seo: HomepageSeoConfig; updateSeo: (patch: Partial<HomepageSeoConfig>) => void }) {
  return (
    <div className="grid gap-4">
      <TextField label="SEO title" onChange={(title) => updateSeo({ title })} value={seo.title} />
      <CharacterMeter current={seo.title.length} max={60} />
      <TextArea label="SEO description" onChange={(description) => updateSeo({ description })} rows={4} value={seo.description} />
      <CharacterMeter current={seo.description.length} max={160} />
      <TextField label="Open Graph title" onChange={(ogTitle) => updateSeo({ ogTitle })} value={seo.ogTitle} />
      <TextArea label="Open Graph description" onChange={(ogDescription) => updateSeo({ ogDescription })} rows={3} value={seo.ogDescription} />
      <ImageUrlField label="Open Graph image" onApply={(ogImage) => updateSeo({ ogImage })} value={seo.ogImage} />
      <TextField label="Canonical URL" onChange={(canonicalUrl) => updateSeo({ canonicalUrl })} value={seo.canonicalUrl} />
      <ToggleRow checked={seo.indexable} label="Indexable" onChange={(indexable) => updateSeo({ indexable })} />
    </div>
  );
}

function ChecksPanel({ changeSummary, setChangeSummary, validation }: { changeSummary: string; setChangeSummary: (summary: string) => void; validation: ValidationResult }) {
  return (
    <div className="grid gap-4">
      <TextArea label="Change summary" onChange={setChangeSummary} rows={3} value={changeSummary} />
      <ValidationGroup items={validation.errors} tone="error" title="Required before publish" />
      <ValidationGroup items={validation.warnings} tone="warning" title="Recommended fixes" />
      {validation.errors.length === 0 && validation.warnings.length === 0 ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck aria-hidden="true" size={16} />
            Ready to publish
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ValidationGroup({ items, title, tone }: { items: string[]; title: string; tone: "error" | "warning" }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("rounded-md border p-3 text-sm", tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-yellow-200 bg-yellow-50 text-yellow-900")}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 grid gap-1">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function HistoryPanel({ versions }: { versions: HomepageVersionSummary[] }) {
  if (versions.length === 0) {
    return <div className="rounded-md border border-dashed border-border bg-surface-muted p-4 text-sm text-secondary">No saved homepage versions yet.</div>;
  }

  return (
    <div className="grid gap-3">
      {versions.map((version) => (
        <article className="rounded-md border border-border bg-surface-muted p-3" key={`${version.versionNumber}-${version.status}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Version {version.versionNumber}</p>
            <span className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-secondary">{version.status}</span>
          </div>
          <p className="mt-2 text-sm text-primary">{version.summary}</p>
          <p className="mt-2 text-xs text-secondary">{formatDate(version.publishedAt ?? version.createdAt)}</p>
        </article>
      ))}
    </div>
  );
}

function PhotoPresetEditor({
  photoPresets,
  selectPhoto,
  updatePhotoPreset,
  removePhotoPreset,
  addCurrentPhotoAsPreset,
  addPhotoPreset,
  useFallback
}: {
  photoPresets: HomepageImagePreset[];
  selectPhoto: (imageUrl: string) => void;
  updatePhotoPreset: (presetId: string, patch: Partial<HomepageImagePreset>) => void;
  removePhotoPreset: (presetId: string) => void;
  addCurrentPhotoAsPreset: () => void;
  addPhotoPreset: (preset: HomepageImagePreset) => void;
  useFallback: () => void;
}) {
  const [presetUploadState, setPresetUploadState] = useState<SaveState>({ tone: "idle", message: "" });

  async function uploadNewPreset(file: File) {
    setPresetUploadState({ tone: "idle", message: "Uploading preset..." });

    try {
      const asset = await uploadAdminImage(file, "homepage-photo-preset");
      const nextIndex = photoPresets.length + 1;
      const preset = {
        id: `uploaded-${Date.now()}`,
        label: labelFromFileName(asset.originalName) || `Uploaded ${nextIndex}`,
        url: asset.url
      };
      addPhotoPreset(preset);
      selectPhoto(asset.url);
      setPresetUploadState({ tone: "success", message: `Uploaded ${asset.originalName}.` });
    } catch (error) {
      setPresetUploadState({ tone: "error", message: error instanceof Error ? error.message : "Image upload failed." });
    }
  }

  async function replacePresetPhoto(preset: HomepageImagePreset, file: File) {
    setPresetUploadState({ tone: "idle", message: `Replacing ${preset.label}...` });

    try {
      const asset = await uploadAdminImage(file, `homepage-photo-preset-${preset.id}`);
      updatePhotoPreset(preset.id, { url: asset.url });
      selectPhoto(asset.url);
      setPresetUploadState({ tone: "success", message: `Replaced ${preset.label}.` });
    } catch (error) {
      setPresetUploadState({ tone: "error", message: error instanceof Error ? error.message : "Image upload failed." });
    }
  }

  return (
    <section className="rounded-md border border-border bg-surface-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Media library</p>
          <p className="mt-1 text-xs text-secondary">Reusable homepage images.</p>
        </div>
        <div className="flex gap-2">
          <Button className="h-9 px-3" onClick={addCurrentPhotoAsPreset} type="button" variant="secondary">
            Add
          </Button>
          <ImageUploadControl className="h-9 min-h-9 px-3" id="photo-preset-upload" label="Upload" onUpload={uploadNewPreset} />
        </div>
      </div>
      <UploadStatus state={presetUploadState} />

      <div className="mt-3 grid gap-3">
        {photoPresets.length > 0 ? (
          photoPresets.map((preset) => (
            <div className="grid gap-3 rounded-md border border-border bg-surface p-2 sm:grid-cols-[88px_minmax(0,1fr)]" key={preset.id}>
              <button
                className="relative h-20 w-full overflow-hidden rounded-md border border-border bg-surface-muted sm:w-[88px]"
                data-photo-preset-id={preset.id}
                data-photo-preset-url={preset.url || defaultHomepageImage}
                data-photo-preset-use="image"
                onClick={() => selectPhoto(preset.url)}
                title={`Use ${preset.label}`}
                type="button"
              >
                <EditablePresetImage alt={preset.label} className="h-full" src={preset.url} />
                <span className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white">Use</span>
              </button>
              <div className="grid min-w-0 gap-2">
                <input aria-label={`${preset.label} preset label`} className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary" onChange={(event) => updatePhotoPreset(preset.id, { label: event.target.value })} value={preset.label} />
                <ImageUrlField compact label={`${preset.label} preset URL`} onApply={(url) => updatePhotoPreset(preset.id, { url })} value={preset.url} />
                <div className="grid grid-cols-3 gap-2">
                  <Button className="h-8 min-h-8 px-2 text-xs" data-photo-preset-id={preset.id} data-photo-preset-url={preset.url || defaultHomepageImage} data-photo-preset-use="button" onClick={() => selectPhoto(preset.url)} type="button" variant="secondary">
                    Use
                  </Button>
                  <ImageUploadControl className="h-8 min-h-8 px-2" id={`replace-preset-${safeDomId(preset.id)}`} label="Replace" onUpload={(file) => replacePresetPhoto(preset, file)} />
                  <Button className="h-8 px-2 text-xs" onClick={() => removePhotoPreset(preset.id)} type="button" variant="quiet">
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-border bg-surface p-4 text-sm text-secondary">No photos yet. The fallback photo will be used.</div>
        )}
      </div>

      <Button className="mt-3 w-full gap-2" onClick={useFallback} type="button" variant="secondary">
        <ImageIcon aria-hidden="true" size={16} />
        Use fallback photo
      </Button>
    </section>
  );
}

function ImageUploadControl({ className, id, label, onUpload }: { className?: string; id: string; label: string; onUpload: (file: File) => Promise<void> }) {
  const [isUploading, setIsUploading] = useState(false);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <label
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-primary transition hover:bg-surface-muted",
        isUploading && "pointer-events-none opacity-60",
        className
      )}
      htmlFor={id}
    >
      <Upload aria-hidden="true" size={15} />
      {isUploading ? "Uploading..." : label}
      <input accept="image/gif,image/jpeg,image/png,image/svg+xml,image/webp" aria-label={label} className="sr-only" disabled={isUploading} id={id} onChange={handleChange} type="file" />
    </label>
  );
}

function UploadStatus({ state }: { state: SaveState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={cn("mt-2 rounded-md border px-2 py-1.5 text-xs", state.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : state.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-border bg-surface text-secondary")} role="status">
      {state.message}
    </p>
  );
}

function ImageUrlField({
  compact = false,
  fieldId,
  focusRequest,
  label,
  value,
  onApply
}: {
  compact?: boolean;
  fieldId?: EditorFocus;
  focusRequest?: EditorFocusRequest | null;
  label: string;
  value: string;
  onApply: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `image-url-${safeDomId(label)}`;

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  useEffect(() => {
    if (fieldId && focusRequest?.field === fieldId) {
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [fieldId, focusRequest]);

  const hasPendingChange = draftValue !== value;

  function applyDraft() {
    onApply(draftValue.trim());
  }

  return (
    <div className={cn("block font-semibold", compact ? "text-xs" : "text-sm")}>
      <label htmlFor={inputId}>{label}</label>
      <div className={cn("mt-2 flex gap-2", compact && "mt-1")}>
        <input
          aria-label={label}
          className={cn("min-w-0 flex-1 rounded-md border border-border bg-surface font-normal outline-none focus:border-primary", compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm")}
          id={inputId}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyDraft();
            }
          }}
          placeholder="https://... or /uploads/admin/..."
          ref={inputRef}
          value={draftValue}
        />
        <Button className={cn("shrink-0", compact ? "h-8 min-h-8 px-2 text-xs" : "h-10 min-h-10 px-3")} disabled={!hasPendingChange} onMouseDown={(event) => event.preventDefault()} onClick={applyDraft} type="button" variant="secondary">
          Apply
        </Button>
      </div>
    </div>
  );
}

async function uploadAdminImage(file: File, context: string) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Upload must be an image file.");
  }

  if (file.size > maxBrowserImageUploadBytes) {
    throw new Error("Upload must be 5 MB or smaller.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("context", context);

  const response = await fetch("/api/admin/media", {
    method: "POST",
    body: formData
  });
  const result = (await response.json()) as AdminMediaUploadResponse;

  if (!response.ok || !result.ok || !result.asset?.url) {
    throw new Error(result.errors?.join(" ") || "Image upload failed.");
  }

  return result.asset;
}

function CharacterMeter({ current, max }: { current: number; max: number }) {
  const over = current > max;

  return <p className={cn("-mt-3 text-xs", over ? "text-red-700" : "text-secondary")}>{current}/{max}</p>;
}

function labelFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-") || "image";
}

function thumbnailImageUrl(src: string) {
  if (!src) {
    return src;
  }

  try {
    const baseUrl = typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const url = new URL(src, baseUrl);

    if (url.hostname.includes("images.unsplash.com")) {
      url.searchParams.set("w", "480");
      url.searchParams.set("q", "70");
    }

    return url.pathname.startsWith("/uploads/") ? url.pathname : url.toString();
  } catch {
    return src;
  }
}

function EditablePresetImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (failed) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-surface-muted text-secondary", className)}>
        <ImageIcon aria-hidden="true" size={24} />
      </div>
    );
  }

  return <img alt={alt} className={cn("h-full w-full object-cover", className)} decoding="async" loading="lazy" onError={() => setFailed(true)} src={thumbnailImageUrl(src)} />;
}

function TextField({
  fieldId,
  focusRequest,
  label,
  value,
  onChange
}: {
  fieldId?: EditorFocus;
  focusRequest?: EditorFocusRequest | null;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fieldId && focusRequest?.field === fieldId) {
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [fieldId, focusRequest]);

  return (
    <label className="block min-w-0 text-sm font-semibold">
      {label}
      <input className="mt-2 w-full min-w-0 max-w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event) => onChange(event.target.value)} ref={inputRef} value={value} />
    </label>
  );
}

function TextArea({
  fieldId,
  focusRequest,
  label,
  value,
  onChange,
  rows = 5
}: {
  fieldId?: EditorFocus;
  focusRequest?: EditorFocusRequest | null;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (fieldId && focusRequest?.field === fieldId) {
      textareaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [fieldId, focusRequest]);

  return (
    <label className="block min-w-0 text-sm font-semibold">
      {label}
      <textarea className="mt-2 w-full min-w-0 max-w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event) => onChange(event.target.value)} ref={textareaRef} rows={rows} value={value} />
    </label>
  );
}

function SelectField({
  fieldId,
  focusRequest,
  label,
  value,
  options,
  onChange
}: {
  fieldId?: EditorFocus;
  focusRequest?: EditorFocusRequest | null;
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (fieldId && focusRequest?.field === fieldId) {
      selectRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      selectRef.current?.focus();
    }
  }, [fieldId, focusRequest]);

  return (
    <label className="block min-w-0 text-sm font-semibold">
      {label}
      <select className="mt-2 w-full min-w-0 max-w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} ref={selectRef} value={value}>
        {options.map((option) => (
          <option key={typeof option === "string" ? option : option.value} value={typeof option === "string" ? option : option.value}>
            {typeof option === "string" ? option : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function isSectionElementVisible(section: HomepageSectionConfig, element: HomepageSectionElement) {
  return !section.hiddenElements?.includes(element);
}

function setSectionElementVisibility(section: HomepageSectionConfig, element: HomepageSectionElement, isVisible: boolean) {
  const hiddenElements = new Set(section.hiddenElements ?? []);

  if (isVisible) {
    hiddenElements.delete(element);
  } else {
    hiddenElements.add(element);
  }

  return hiddenElements.size > 0 ? Array.from(hiddenElements) : undefined;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-semibold">
      <span className="min-w-0 leading-snug">{label}</span>
      <input checked={checked} className="h-5 w-5 shrink-0 rounded border-border" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function validateHomepage(sections: HomepageSectionConfig[], seo: HomepageSeoConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const visibleHero = sections.find((section) => section.sectionId === "home.hero" && section.isVisible);

  if (!visibleHero) {
    errors.push("A visible hero section is required.");
  }

  if (visibleHero && isSectionElementVisible(visibleHero, "items") && (visibleHero.items?.length ?? 0) !== 4) {
    errors.push("Homepage hero needs exactly four promotional cards.");
  }

  for (const section of sections.filter((item) => item.isVisible)) {
    if (isSectionElementVisible(section, "title") && !section.title.trim()) {
      errors.push(`${sectionLabel(section.sectionId)} needs a title.`);
    }

    if (isSectionElementVisible(section, "body") && !section.body.trim()) {
      warnings.push(`${sectionLabel(section.sectionId)} has no body copy.`);
    }

    if (section.ctaHref && !isSafeUrl(section.ctaHref)) {
      errors.push(`${sectionLabel(section.sectionId)} button link must be an internal path or HTTPS URL.`);
    }

    if (isSectionElementVisible(section, "primaryCta") && section.ctaHref && !section.ctaLabel) {
      errors.push(`${sectionLabel(section.sectionId)} button label is required when a link exists.`);
    }

    if (section.secondaryCtaHref && !isSafeUrl(section.secondaryCtaHref)) {
      errors.push(`${sectionLabel(section.sectionId)} secondary button link must be an internal path or HTTPS URL.`);
    }

    if (isSectionElementVisible(section, "secondaryCta") && section.secondaryCtaHref && !section.secondaryCtaLabel) {
      errors.push(`${sectionLabel(section.sectionId)} secondary button label is required when a link exists.`);
    }

    if (section.heroSize && !["compact", "standard", "large", "fullscreen"].includes(section.heroSize)) {
      errors.push(`${sectionLabel(section.sectionId)} has an invalid hero size.`);
    }

    if (section.backgroundImage && !section.imageAlt) {
      warnings.push(`${sectionLabel(section.sectionId)} image should have alt text.`);
    }

    for (const item of section.items ?? []) {
      if (!item.title.trim()) {
        errors.push(`${sectionLabel(section.sectionId)} item needs a title.`);
      }

      if (item.href && !isSafeUrl(item.href)) {
        errors.push(`${sectionLabel(section.sectionId)} item link must be an internal path or HTTPS URL.`);
      }

      if (section.sectionId === "home.hero" && !item.href) {
        errors.push("Every homepage promotional card needs a destination.");
      }

      if (item.linkType && item.linkType !== "manual" && !item.linkValue) {
        errors.push(`${sectionLabel(section.sectionId)} item must select a ${item.linkType} destination.`);
      }

      if (item.tone && !["yellow", "cyan", "green", "red", "white"].includes(item.tone)) {
        errors.push(`${sectionLabel(section.sectionId)} item has an invalid card color.`);
      }

      if (item.presentation && !["card", "cutout"].includes(item.presentation)) {
        errors.push(`${sectionLabel(section.sectionId)} item has an invalid presentation.`);
      }

      if (section.sectionId === "home.hero" && item.presentation === "cutout" && !item.image) {
        errors.push(`${item.title || "Homepage cutout"} needs an image before publishing.`);
      }

      if (item.image && !item.imageAlt) {
        warnings.push(`${sectionLabel(section.sectionId)} item image should have alt text.`);
      }
    }
  }

  if (!seo.title.trim()) {
    errors.push("SEO title is required.");
  }

  if (!seo.description.trim()) {
    errors.push("SEO description is required.");
  }

  if (seo.canonicalUrl && !isSafeUrl(seo.canonicalUrl)) {
    errors.push("Canonical URL must be an internal path or HTTPS URL.");
  }

  if (seo.title.length > 60) {
    warnings.push("SEO title is longer than 60 characters.");
  }

  if (seo.description.length > 160) {
    warnings.push("SEO description is longer than 160 characters.");
  }

  return { errors, warnings };
}

function isSafeUrl(value: string) {
  return value.startsWith("/") || value.startsWith("https://");
}

function inferHomepageItemLinkType(item: HomepageSectionItem): HomepageItemLinkType {
  if (item.linkType) return item.linkType;
  if (item.productSlug || item.href?.startsWith("/products/")) return "product";

  try {
    const url = new URL(item.href || "/", "http://localhost");
    if (url.pathname === "/shop" && url.searchParams.has("brand")) return "brand";
    if (url.pathname === "/shop" && url.searchParams.has("department")) return "category";
  } catch {
    return "manual";
  }

  return "manual";
}

function inferHomepageItemLinkValue(item: HomepageSectionItem, linkType: HomepageItemLinkType) {
  if (linkType === "page") return item.linkValue || item.href || "";
  if (linkType === "product") return item.productSlug || item.href?.replace(/^\/products\//, "") || "";

  try {
    const url = new URL(item.href || "/", "http://localhost");
    const rawValue = linkType === "brand" ? url.searchParams.get("brand") : linkType === "category" ? url.searchParams.get("department") : "";
    return rawValue?.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "";
  } catch {
    return "";
  }
}

function uniqueSectionId(prefix: string) {
  return `${prefix.replace(/[^a-zA-Z0-9.-]+/g, "-")}.${Date.now().toString(36)}`;
}

function nextSortOrder(sections: HomepageSectionConfig[]) {
  return Math.max(0, ...sections.map((section) => section.sortOrder || 0)) + 10;
}

function withSequentialSortOrder(sections: HomepageSectionConfig[]) {
  return sections.map((section, index) => ({ ...section, sortOrder: (index + 1) * 10 }));
}

function defaultEditableItemsForSection(section: HomepageSectionConfig): HomepageSectionItem[] {
  if (section.sectionId === "home.departments" || sectionTypeFromSection(section) === "departments") {
    return [
      productItemFallback("premium-building-set", {
        id: "toys",
        title: "Toys",
        body: "Classic favorites, games, plush, puzzles, and creative play.",
        href: "/toys"
      }),
      productItemFallback("celebration-tableware-kit", {
        id: "party-supplies",
        title: "Party",
        body: "Tableware, decorations, invitations, gift wrap, and event essentials.",
        href: "/party-supplies"
      }),
      productItemFallback("mylar-balloon-pick", {
        id: "balloons",
        title: "Balloons",
        body: "Latex, mylar, numbers, bouquets, pickup, and local delivery.",
        href: "/balloons"
      }),
      productItemFallback("gift-wrap-pack", {
        id: "gifts",
        title: "Gifts",
        body: "Neighborhood-ready gifts, wrap, frames, albums, and small finds.",
        href: "/gifts"
      })
    ];
  }

  return [];
}

function productItemFallback(productSlug: string, fallback: HomepageSectionItem): HomepageSectionItem {
  const product = storefrontProducts.find((candidate) => candidate.slug === productSlug);

  if (!product) {
    return fallback;
  }

  return {
    ...fallback,
    title: product.name,
    body: product.shortDescription,
    href: `/products/${product.slug}`,
    image: product.imageUrl,
    imageAlt: product.name,
    badge: product.badge,
    productSlug: product.slug,
    squareVariationId: product.squareVariationId
  };
}

function sectionTypeFromSection(section: HomepageSectionConfig): NonNullable<HomepageSectionConfig["sectionType"]> {
  if (section.sectionType) {
    return section.sectionType;
  }

  if (section.sectionId === "home.hero") {
    return "hero";
  }

  if (section.sectionId === "home.departments") {
    return "departments";
  }

  if (section.sectionId === "home.featured-products") {
    return "product-grid";
  }

  if (section.sectionId === "home.balloon-promo") {
    return "promo";
  }

  if (section.sectionId === "home.local-storefront") {
    return "storefront";
  }

  return "content";
}

function sectionLabel(sectionId: string) {
  return sectionId
    .replace("home.", "")
    .replace("custom.", "")
    .replace(/\.[a-z0-9]+$/i, "")
    .split("-")
    .flatMap((part) => part.split("."))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function previewCanvasDesignWidth(previewMode: PreviewMode) {
  if (previewMode === "mobile") {
    return 390;
  }

  if (previewMode === "tablet") {
    return 760;
  }

  return 1440;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function homepageSnapshotSignature(snapshot: HomepageEditingSnapshot) {
  return JSON.stringify(snapshot);
}
