"use client";

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  History,
  Image,
  LayoutDashboard,
  Link2,
  ListChecks,
  Monitor,
  PanelRight,
  Plus,
  Rocket,
  Save,
  Search,
  Trash2,
  ShieldCheck,
  Smartphone,
  Tablet,
  Upload
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { StorefrontPageSwitcher } from "@/components/admin/storefront-page-switcher";
import { HomePageTemplate } from "@/components/templates/home-page-template";
import { Button } from "@/components/ui/button";
import { defaultHeaderNavigation, type HeaderNavigationConfig, type HeaderNavigationLink } from "@/config/header-navigation.config";
import { storefrontEditablePages } from "@/config/storefront-pages.config";
import {
  defaultHomepageImage,
  homepageImagePresets,
  homepageSections,
  homepageSectionTemplates,
  type HomepageImagePreset,
  type HomepageSectionConfig,
  type HomepageSectionElement,
  type HomepageSectionItem,
  type HomepageSectionTemplate
} from "@/config/homepage.config";
import { storefrontProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { cn } from "@/lib/utils";

type HomepageSeoConfig = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalUrl: string;
  indexable: boolean;
};

type HomepageVersionSummary = {
  versionNumber: number;
  status: string;
  title: string;
  createdAt: string;
  publishedAt: string | null;
  summary: string;
};

type HomepageStudioEditorProps = {
  initialHeaderNavigation?: HeaderNavigationConfig;
  initialPhotoPresets?: HomepageImagePreset[];
  initialSections: HomepageSectionConfig[];
  initialSeo?: HomepageSeoConfig;
  initialVersions?: HomepageVersionSummary[];
};

type PreviewMode = "desktop" | "tablet" | "mobile";
type EditorPanel = "content" | "design" | "media" | "navigation" | "seo" | "checks" | "history";
type EditorFocus = "section" | "eyebrow" | "title" | "body" | "ctaLabel" | "ctaHref" | "media" | "imageAlt" | "items" | "textPosition" | "mediaPlacement" | "backgroundTone" | "contentWidth" | "verticalPadding" | "columns";
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

const defaultSeo: HomepageSeoConfig = {
  title: "Modern State - State News NYC",
  description: "Toys, party supplies, balloons, stationery, arts and crafts, greeting cards, and gifts on the Upper East Side.",
  ogTitle: "Modern State - State News NYC",
  ogDescription: "Shop Modern State for toys, balloons, party supplies, stationery, gifts, and neighborhood essentials.",
  ogImage: defaultHomepageImage,
  canonicalUrl: "/",
  indexable: true
};

const sectionPurpose: Record<string, string> = {
  "home.hero": "First viewport, primary campaign copy, hero image, and main CTA.",
  "home.departments": "Guides shoppers into the core store departments.",
  "home.featured-products": "Highlights products and online merchandising picks.",
  "home.balloon-promo": "Promotes guided balloon orders and fulfillment rules.",
  "home.local-storefront": "Shows the physical stores, pickup context, and local trust."
};

const sectionTypePurpose: Record<NonNullable<HomepageSectionConfig["sectionType"]>, string> = {
  hero: "First viewport with campaign copy, image, and CTA.",
  departments: "Department navigation tied to the public store categories.",
  "product-grid": "Merchandised products from the storefront catalog.",
  promo: "Promotional copy with editable supporting cards.",
  storefront: "Physical store context, pickup trust, and local details.",
  content: "Flexible editorial, SEO, or informational copy.",
  "image-banner": "Full-width visual campaign banner.",
  "feature-grid": "Editable cards for benefits, services, or collections.",
  "split-media": "Image and copy block for storytelling or services.",
  "trust-bar": "Compact proof points for checkout confidence.",
  newsletter: "Reusable signup or customer-service CTA.",
  faq: "Editable questions and answers."
};

const coreHomepageSectionIds = new Set(homepageSections.map((section) => section.sectionId));

const panelTabs: Array<{ id: EditorPanel; label: string; icon: typeof PanelRight }> = [
  { id: "content", label: "Content", icon: PanelRight },
  { id: "design", label: "Design", icon: LayoutDashboard },
  { id: "media", label: "Media", icon: Image },
  { id: "navigation", label: "Navigation", icon: Link2 },
  { id: "seo", label: "SEO", icon: Search },
  { id: "checks", label: "Checks", icon: ListChecks },
  { id: "history", label: "History", icon: History }
];

export function HomepageStudioEditor({
  initialHeaderNavigation = defaultHeaderNavigation,
  initialPhotoPresets = homepageImagePresets,
  initialSections,
  initialSeo = defaultSeo,
  initialVersions = []
}: HomepageStudioEditorProps) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const [headerNavigation, setHeaderNavigation] = useState<HeaderNavigationConfig>(() => initialHeaderNavigation);
  const [sections, setSections] = useState(() => [...initialSections].sort((a, b) => a.sortOrder - b.sortOrder));
  const [photoPresets, setPhotoPresets] = useState<HomepageImagePreset[]>(() => (initialPhotoPresets.length > 0 ? initialPhotoPresets : homepageImagePresets));
  const [seo, setSeo] = useState<HomepageSeoConfig>(() => ({ ...defaultSeo, ...initialSeo }));
  const [versions, setVersions] = useState<HomepageVersionSummary[]>(initialVersions);
  const [selectedSectionId, setSelectedSectionId] = useState(initialSections[0]?.sectionId ?? "home.hero");
  const [activePanel, setActivePanel] = useState<EditorPanel>("content");
  const [focusRequest, setFocusRequest] = useState<EditorFocusRequest | null>(null);
  const [selectedNavigationItemId, setSelectedNavigationItemId] = useState(headerNavigation.primary[0]?.id ?? "shop-all");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [changeSummary, setChangeSummary] = useState("Homepage visual update");
  const [saveState, setSaveState] = useState<SaveState>({ tone: "idle", message: "Ready" });
  const [isDirty, setIsDirty] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [previewFrameWidth, setPreviewFrameWidth] = useState(0);
  const [previewCanvasHeight, setPreviewCanvasHeight] = useState(0);
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

  function commitSections(updater: (current: HomepageSectionConfig[]) => HomepageSectionConfig[]) {
    setIsDirty(true);
    setSections((current) => updater(current));
  }

  function commitPhotoPresets(updater: (current: HomepageImagePreset[]) => HomepageImagePreset[]) {
    setIsDirty(true);
    setPhotoPresets((current) => updater(current));
  }

  function commitHeaderNavigation(updater: (current: HeaderNavigationConfig) => HeaderNavigationConfig) {
    setIsDirty(true);
    setHeaderNavigation((current) => updater(current));
  }

  function commitSeo(patch: Partial<HomepageSeoConfig>) {
    setIsDirty(true);
    setSeo((current) => ({ ...current, ...patch }));
  }

  function updateSelected(patch: Partial<HomepageSectionConfig>) {
    commitSections((current) => current.map((section) => (section.sectionId === selectedSectionId ? { ...section, ...patch } : section)));
  }

  function openPreviewTarget(target: PreviewEditTarget) {
    setSelectedSectionId(target.sectionId);
    setActivePanel(target.panel);
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

    setSelectedNavigationItemId(navigationItemId);
    setActivePanel("navigation");
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
      setSaveState({ tone: "error", message: "Fix required checks before publishing." });
      return;
    }

    setSaveState({ tone: "idle", message: operation === "publish" ? "Publishing..." : "Saving..." });
    const hero = sections.find((section) => section.sectionId === "home.hero") ?? selectedSection;
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        moduleId: "homepage",
        operation,
        values: {
          title: seo.title || hero.title || "Website editor update",
          summary: changeSummary || "Website editor state.",
          ctaLabel: hero.ctaLabel || "",
          ctaHref: hero.ctaHref || "/",
          status: operation === "publish" ? "Visible" : "Draft",
          sectionOrder: sections.map((section) => section.sectionId),
          visualSections: JSON.stringify(sections),
          headerNavigation: JSON.stringify(headerNavigation),
          photoPresets: JSON.stringify(photoPresets),
          seoMetadata: JSON.stringify(seo),
          changeSummary
        }
      })
    });
    const result = (await response.json()) as AdminOperationResponse;

    if (!response.ok || !result.ok) {
      setSaveState({ tone: "error", message: Array.isArray(result.errors) ? result.errors.join(" ") : "Could not save." });
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
          summary: changeSummary || "Website editor update"
        },
        ...current
      ].slice(0, 12)
    );
    setIsDirty(false);
    setSaveState({ tone: "success", message: result.storage?.message ?? "Saved." });
  }

  return (
    <main className="p-4 lg:h-screen lg:overflow-hidden lg:p-4 xl:p-6">
      <div
        ref={editorRef}
        className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)]"
        data-hydrated={isHydrated ? "true" : "false"}
        data-store-area="Admin"
        data-store-component="HomepageVisualEditor"
        data-store-section="admin.homepage-visual-editor"
      >
        <EditorTopBar
          activePanel={activePanel}
          canPublish={validation.errors.length === 0}
          isDirty={isDirty}
          onOpenStorefront={() => window.open("/", "_blank", "noopener,noreferrer")}
          onPanelChange={setActivePanel}
          onPreview={() => submit("preview")}
          onPublish={() => submit("publish")}
          onSaveDraft={() => submit("save_draft")}
          previewMode={previewMode}
          saveState={saveState}
          setPreviewMode={setPreviewMode}
          validation={validation}
        />

        <div className="grid min-h-[720px] gap-4 lg:min-h-0 lg:grid-cols-[280px_minmax(440px,1fr)_minmax(360px,420px)] lg:overflow-hidden">
          <aside className="grid content-start gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <StorefrontPageSwitcher currentEntityId="home" currentScope="homepage" onBeforeNavigate={() => !isDirty || window.confirm("You have unsaved homepage changes. Continue to another store area editor?")} />
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
                setFocusRequest({ field: "section", token: Date.now() });
              }}
              sections={sections}
              selectedSection={selectedSection}
              selectedSectionId={selectedSection.sectionId}
            />
          </aside>

          <section className="min-w-0 rounded-md border border-border bg-surface-muted p-3 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Live preview</p>
                <h2 className="font-display text-lg font-semibold">{previewModeLabel(previewMode)}</h2>
              </div>
              <div className="flex gap-2">
                <Button className="h-9 gap-2 px-3" onClick={() => moveSelected(-1)} type="button" variant="secondary">
                  <ArrowUp aria-hidden="true" size={16} />
                  Up
                </Button>
                <Button className="h-9 gap-2 px-3" onClick={() => moveSelected(1)} type="button" variant="secondary">
                  <ArrowDown aria-hidden="true" size={16} />
                  Down
                </Button>
              </div>
            </div>

            <div className="mx-auto w-full overflow-auto rounded-md border border-border bg-surface shadow-sm transition-all lg:min-h-0 lg:flex-1" data-preview-frame="true" ref={previewFrameRef}>
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
                  <StorefrontPreview headerNavigation={headerNavigation} onEditNavigationTarget={openNavigationTarget} onEditTarget={openPreviewTarget} sections={visibleSections} selectedSectionId={selectedSection.sectionId} />
                </div>
              </div>
            </div>
          </section>

          <InspectorPanel
            activePanel={activePanel}
            addPhotoPreset={(preset) => commitPhotoPresets((current) => [...current, preset])}
            changeSummary={changeSummary}
            focusRequest={focusRequest}
            headerNavigation={headerNavigation}
            photoPresets={photoPresets}
            removePhotoPreset={(presetId) => commitPhotoPresets((current) => (current.length > 1 ? current.filter((preset) => preset.id !== presetId) : current))}
            section={selectedSection}
            selectedNavigationItemId={selectedNavigationItemId}
            seo={seo}
            setActivePanel={setActivePanel}
            setChangeSummary={(summary) => {
              setIsDirty(true);
              setChangeSummary(summary);
            }}
            updatePhotoPreset={(presetId, patch) => commitPhotoPresets((current) => current.map((preset) => (preset.id === presetId ? { ...preset, ...patch } : preset)))}
            updateHeaderNavigation={commitHeaderNavigation}
            updateSection={updateSelected}
            updateSeo={commitSeo}
            validation={validation}
            versions={versions}
          />
        </div>
      </div>
    </main>
  );
}

function EditorTopBar({
  activePanel,
  canPublish,
  isDirty,
  onOpenStorefront,
  onPanelChange,
  onPreview,
  onPublish,
  onSaveDraft,
  previewMode,
  saveState,
  setPreviewMode,
  validation
}: {
  activePanel: EditorPanel;
  canPublish: boolean;
  isDirty: boolean;
  onOpenStorefront: () => void;
  onPanelChange: (panel: EditorPanel) => void;
  onPreview: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  previewMode: PreviewMode;
  saveState: SaveState;
  setPreviewMode: (mode: PreviewMode) => void;
  validation: ValidationResult;
}) {
  return (
    <header className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Website editor</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Editor</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill isDirty={isDirty} saveState={saveState} validation={validation} />
          <SegmentedPreviewMode previewMode={previewMode} setPreviewMode={setPreviewMode} />
          <Button className="h-10 gap-2 px-3" onClick={onOpenStorefront} type="button" variant="secondary">
            <Eye aria-hidden="true" size={16} />
            Open
          </Button>
          <Button className="h-10 gap-2 px-3" onClick={onSaveDraft} type="button" variant="secondary">
            <Save aria-hidden="true" size={16} />
            Draft
          </Button>
          <Button className="h-10 gap-2 px-3" onClick={onPreview} type="button" variant="secondary">
            <Monitor aria-hidden="true" size={16} />
            Preview
          </Button>
          <Button className="h-10 gap-2 px-3" disabled={!canPublish} onClick={onPublish} type="button">
            <Rocket aria-hidden="true" size={16} />
            Publish
          </Button>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {panelTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              aria-pressed={activePanel === tab.id}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                activePanel === tab.id ? "border-primary bg-surface-muted text-primary" : "border-border text-secondary hover:border-primary hover:text-primary"
              )}
              key={tab.id}
              onClick={() => onPanelChange(tab.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function StatusPill({ isDirty, saveState, validation }: { isDirty: boolean; saveState: SaveState; validation: ValidationResult }) {
  if (saveState.tone === "error") {
    return <span className="inline-flex min-h-9 items-center rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-900">{saveState.message}</span>;
  }

  if (validation.errors.length > 0) {
    return <span className="inline-flex min-h-9 items-center rounded-md border border-yellow-200 bg-yellow-50 px-3 text-sm font-semibold text-yellow-900">{validation.errors.length} required fix</span>;
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
  return (
    <aside className="rounded-md border border-border bg-surface p-3 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Sections</p>
            <h2 className="font-display text-lg font-semibold">Page blocks</h2>
          </div>
          <div className="flex gap-1">
            <Button className="h-9 w-9 px-0" onClick={() => moveSelected(-1)} title="Move up" type="button" variant="quiet">
              <ArrowUp aria-hidden="true" size={16} />
            </Button>
            <Button className="h-9 w-9 px-0" onClick={() => moveSelected(1)} title="Move down" type="button" variant="quiet">
              <ArrowDown aria-hidden="true" size={16} />
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button className="h-9 gap-2 px-2 text-xs" onClick={duplicateSelectedSection} title="Duplicate selected section" type="button" variant="secondary">
            <Copy aria-hidden="true" size={15} />
            Duplicate
          </Button>
          <Button className="h-9 gap-2 px-2 text-xs" onClick={removeSelectedSection} title={coreHomepageSectionIds.has(selectedSection.sectionId) ? "Hide selected core section" : "Remove selected section"} type="button" variant="quiet">
            <Trash2 aria-hidden="true" size={15} />
            {coreHomepageSectionIds.has(selectedSection.sectionId) ? "Hide" : "Remove"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        <div className="grid gap-2">
          {sections.map((section, index) => (
            <button
              aria-pressed={section.sectionId === selectedSectionId}
              className={cn(
                "grid gap-1 rounded-md border p-3 text-left text-sm transition",
                section.sectionId === selectedSectionId ? "border-primary bg-surface-muted text-primary" : "border-border text-secondary hover:border-primary hover:text-primary",
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
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <GripVertical aria-hidden="true" className="shrink-0 text-secondary" size={16} />
                  <span className="truncate font-semibold">{sectionLabel(section.sectionId)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  {section.isVisible ? <Eye aria-hidden="true" size={15} /> : <EyeOff aria-hidden="true" size={15} />}
                  {index + 1}
                </span>
              </span>
              <span className="text-xs text-secondary">{sectionDescription(section)}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Plus aria-hidden="true" className="text-secondary" size={16} />
            <p className="text-sm font-semibold">Add section</p>
          </div>
          <div className="mt-3 grid gap-2">
            {homepageSectionTemplates.map((template) => (
              <button
                className="rounded-md border border-border bg-surface-muted p-3 text-left text-sm transition hover:border-primary hover:text-primary"
                key={template.id}
                onClick={() => addSectionFromTemplate(template)}
                type="button"
              >
                <span className="font-semibold">{template.title}</span>
                <span className="mt-1 block text-xs text-secondary">{template.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function StorefrontPreview({
  headerNavigation,
  onEditNavigationTarget,
  sections,
  selectedSectionId,
  onEditTarget
}: {
  headerNavigation: HeaderNavigationConfig;
  onEditNavigationTarget: (navigationItemId: string) => void;
  sections: HomepageSectionConfig[];
  selectedSectionId: string;
  onEditTarget: (target: PreviewEditTarget) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preview = previewRef.current;

    if (!preview) {
      return;
    }

    const scrollContainer = preview.closest<HTMLElement>("[data-preview-frame='true']");

    if (selectedSectionId === "home.hero") {
      scrollContainer?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const selectedPreviewSection = Array.from(preview.querySelectorAll<HTMLElement>("[data-cms-section-id]")).find((element) => element.dataset.cmsSectionId === selectedSectionId);
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
      <HomePageTemplate sections={sections} />
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

function PreviewSection({ isSelected, onEditTarget, section }: { isSelected: boolean; onEditTarget: (target: PreviewEditTarget) => void; section: HomepageSectionConfig }) {
  const selectableClass = cn("relative cursor-pointer outline-none transition", isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-surface");
  const sectionType = sectionTypeFromSection(section);
  const edit = (panel: EditorPanel, focus: EditorFocus) => onEditTarget({ sectionId: section.sectionId, panel, focus });

  if (sectionType === "hero" || sectionType === "image-banner") {
    return (
      <section
        className={cn("min-h-[420px] bg-cover px-6 text-white", previewPaddingClass(section), selectableClass, previewBackgroundClass(section), previewTextClass(section))}
        data-preview-section-id={section.sectionId}
        onClick={() => edit("content", "section")}
        style={{ backgroundImage: previewBackgroundImage(section) }}
      >
        <div className="absolute inset-0 bg-black/45" />
        {isSelected ? <PreviewSectionToolbar onContent={() => edit("content", "title")} onDesign={() => edit("design", "textPosition")} onMedia={() => edit("media", "media")} /> : null}
        <PreviewEditPill className="right-4 top-16" label="Image" onClick={() => edit("media", "media")} />
        <div className={cn("relative max-w-2xl", previewTextWidthClass(section))}>
          {isSectionElementVisible(section, "eyebrow") && section.eyebrow ? (
            <p className="rounded-md text-xs font-semibold uppercase tracking-[0.14em] text-yellow outline-offset-4 hover:outline hover:outline-2 hover:outline-yellow" onClick={(event) => preventAndEdit(event, () => edit("content", "eyebrow"))}>
              {section.eyebrow}
            </p>
          ) : null}
          {isSectionElementVisible(section, "title") && section.title ? (
            <h2 className="mt-3 rounded-md font-display text-4xl font-semibold leading-tight outline-offset-4 hover:outline hover:outline-2 hover:outline-white" onClick={(event) => preventAndEdit(event, () => edit("content", "title"))}>
              {section.title}
            </h2>
          ) : null}
          {isSectionElementVisible(section, "body") && section.body ? (
            <p className="mt-4 rounded-md text-white/88 outline-offset-4 hover:outline hover:outline-2 hover:outline-white" onClick={(event) => preventAndEdit(event, () => edit("content", "body"))}>
              {section.body}
            </p>
          ) : null}
          {isSectionElementVisible(section, "primaryCta") && section.ctaLabel ? (
            <span className="mt-6 inline-flex rounded-md bg-[var(--theme-action)] px-4 py-2 text-sm font-semibold text-[var(--theme-action-foreground)] outline-offset-4 hover:outline hover:outline-2 hover:outline-white" onClick={(event) => preventAndEdit(event, () => edit("content", "ctaLabel"))}>
              {section.ctaLabel}
            </span>
          ) : null}
          {isSectionElementVisible(section, "items") && section.items?.length ? <PreviewMiniItems items={section.items} onClick={() => edit("content", "items")} tone="dark" /> : null}
        </div>
      </section>
    );
  }

  const hasSideImage = Boolean(section.backgroundImage) && (section.mediaPlacement === "left" || section.mediaPlacement === "right");
  const sideImage = hasSideImage ? (
    <button className="relative block w-full rounded-md text-left outline-offset-4 hover:outline hover:outline-2 hover:outline-primary" onClick={(event) => preventAndEdit(event, () => edit("media", "media"))} type="button">
      <EditablePresetImage alt={section.imageAlt || `${sectionLabel(section.sectionId)} image`} className="aspect-[4/3] rounded-md border border-border" src={section.backgroundImage || defaultHomepageImage} />
      <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">Edit image</span>
    </button>
  ) : null;
  const backgroundStyle = section.mediaPlacement === "background" && section.backgroundImage ? { backgroundImage: previewBackgroundImage(section) } : undefined;

  return (
    <section
      className={cn(
        "px-6",
        previewPaddingClass(section),
        previewToneClass(section),
        section.mediaPlacement === "background" && "bg-cover text-white",
        selectableClass
      )}
      data-preview-section-id={section.sectionId}
      onClick={() => edit("content", "section")}
      style={backgroundStyle}
    >
      {isSelected ? <PreviewSectionToolbar onContent={() => edit("content", "title")} onDesign={() => edit("design", "textPosition")} onMedia={() => edit("media", "media")} /> : null}
      {section.mediaPlacement === "background" ? <PreviewEditPill className="right-4 top-16" label="Image" onClick={() => edit("media", "media")} /> : null}
      <div className={cn(hasSideImage && "grid gap-6 md:grid-cols-2 md:items-center")}>
        {section.mediaPlacement === "left" ? sideImage : null}
        <div>
          <div className={cn("mb-6 max-w-2xl", previewTextClass(section), previewTextWidthClass(section))}>
            {isSectionElementVisible(section, "eyebrow") && section.eyebrow ? (
              <p className={cn("rounded-md text-xs font-semibold uppercase tracking-[0.14em] outline-offset-4 hover:outline hover:outline-2 hover:outline-primary", section.mediaPlacement === "background" ? "text-white/80 hover:outline-white" : "text-secondary")} onClick={(event) => preventAndEdit(event, () => edit("content", "eyebrow"))}>
                {section.eyebrow}
              </p>
            ) : null}
            {isSectionElementVisible(section, "title") && section.title ? (
              <h2 className="rounded-md font-display text-3xl font-semibold outline-offset-4 hover:outline hover:outline-2 hover:outline-primary" onClick={(event) => preventAndEdit(event, () => edit("content", "title"))}>
                {section.title}
              </h2>
            ) : null}
            {isSectionElementVisible(section, "body") && section.body ? (
              <p className={cn("mt-3 rounded-md outline-offset-4 hover:outline hover:outline-2 hover:outline-primary", section.mediaPlacement === "background" ? "text-white/88 hover:outline-white" : "text-secondary")} onClick={(event) => preventAndEdit(event, () => edit("content", "body"))}>
                {section.body}
              </p>
            ) : null}
            {isSectionElementVisible(section, "primaryCta") && section.ctaLabel ? (
              <span className="mt-5 inline-flex rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-primary outline-offset-4 hover:outline hover:outline-2 hover:outline-primary" onClick={(event) => preventAndEdit(event, () => edit("content", "ctaLabel"))}>
                {section.ctaLabel}
              </span>
            ) : null}
          </div>
          {isSectionElementVisible(section, "items") ? <PlaceholderLayout layout={section.placeholderLayout ?? "grid"} onEditItems={() => edit("content", "items")} section={section} /> : null}
        </div>
        {section.mediaPlacement === "right" ? sideImage : null}
      </div>
    </section>
  );
}

function PreviewSectionToolbar({ onContent, onDesign, onMedia }: { onContent: () => void; onDesign: () => void; onMedia: () => void }) {
  return (
    <div className="absolute right-3 top-3 z-20 flex gap-1 rounded-md border border-border bg-surface/95 p-1 text-primary shadow-sm" onClick={(event) => event.stopPropagation()}>
      <button className="rounded px-2 py-1 text-xs font-semibold hover:bg-surface-muted" onClick={onContent} type="button">
        Text
      </button>
      <button className="rounded px-2 py-1 text-xs font-semibold hover:bg-surface-muted" onClick={onMedia} type="button">
        Image
      </button>
      <button className="rounded px-2 py-1 text-xs font-semibold hover:bg-surface-muted" onClick={onDesign} type="button">
        Layout
      </button>
    </div>
  );
}

function PreviewEditPill({ className, label, onClick }: { className?: string; label: string; onClick: () => void }) {
  return (
    <button className={cn("absolute z-20 rounded-md border border-white/30 bg-black/70 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-black", className)} onClick={(event) => preventAndEdit(event, onClick)} type="button">
      Edit {label}
    </button>
  );
}

function InspectorPanel({
  activePanel,
  section,
  updateSection,
  headerNavigation,
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
  setChangeSummary,
  setActivePanel
}: {
  activePanel: EditorPanel;
  section: HomepageSectionConfig;
  updateSection: (patch: Partial<HomepageSectionConfig>) => void;
  headerNavigation: HeaderNavigationConfig;
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

  return (
    <aside className="rounded-md border border-border bg-surface p-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain" ref={inspectorRef}>
      <div className="mb-4 lg:sticky lg:top-0 lg:z-20 lg:-mx-4 lg:-mt-4 lg:border-b lg:border-border lg:bg-surface/95 lg:p-4 lg:backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Inspector</p>
        <h2 className="mt-1 font-display text-xl font-semibold">{activePanel === "navigation" ? "Header navigation" : activePanel === "seo" ? "Homepage SEO" : activePanel === "history" ? "Version history" : sectionLabel(section.sectionId)}</h2>
        <p className="mt-1 text-xs text-secondary">{activePanel === "navigation" ? "Edit the public header links shown in the website preview." : activePanel === "seo" ? "Search and social metadata for the public homepage." : activePanel === "history" ? "Recent draft, preview, and publish snapshots." : sectionDescription(section)}</p>
      </div>

      {activePanel === "content" ? <ContentPanel focusRequest={focusRequest} section={section} setActivePanel={setActivePanel} updateSection={updateSection} /> : null}
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
    <div className="grid gap-4">
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
  setActivePanel,
  updateSection,
  focusRequest
}: {
  section: HomepageSectionConfig;
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
        {isHero ? <ToggleRow checked={isSectionElementVisible(section, "secondaryCta")} label="Show balloon button" onChange={(checked) => updateSection({ hiddenElements: setSectionElementVisibility(section, "secondaryCta", checked) })} /> : null}
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
          Button
        </div>
        <TextField fieldId="ctaLabel" focusRequest={focusRequest} label="Button label" onChange={(ctaLabel) => updateSection({ ctaLabel })} value={section.ctaLabel ?? ""} />
        <TextField fieldId="ctaHref" focusRequest={focusRequest} label="Button link" onChange={(ctaHref) => updateSection({ ctaHref })} value={section.ctaHref ?? ""} />
      </div>
      <Button className="gap-2" onClick={() => setActivePanel("media")} type="button" variant="secondary">
        <Image aria-hidden="true" size={16} />
        Edit image
      </Button>
      <SectionItemsEditor focusRequest={focusRequest} section={section} updateSection={updateSection} />
    </div>
  );
}

function SectionItemsEditor({ section, updateSection, focusRequest }: { section: HomepageSectionConfig; updateSection: (patch: Partial<HomepageSectionConfig>) => void; focusRequest: EditorFocusRequest | null }) {
  const itemsRef = useRef<HTMLElement>(null);
  const [itemUploadStates, setItemUploadStates] = useState<Record<string, SaveState>>({});
  const storedItems = section.items ?? [];
  const defaultItems = defaultEditableItemsForSection(section);
  const items = storedItems.length > 0 ? storedItems : defaultItems;
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
    updateItems([
      ...items,
      {
        id: uniqueSectionId("item"),
        title: `Item ${items.length + 1}`,
        body: "Editable item copy."
      }
    ]);
  }

  function updateItem(itemId: string, patch: Partial<HomepageSectionItem>) {
    updateItems(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeItem(itemId: string) {
    updateItems(items.filter((item) => item.id !== itemId));
  }

  function selectProductForItem(item: HomepageSectionItem, productSlug: string) {
    const product = storefrontProducts.find((candidate) => candidate.slug === productSlug);

    if (!product) {
      updateItem(item.id, {
        productSlug: undefined,
        squareVariationId: undefined
      });
      return;
    }

    updateItem(item.id, {
      productSlug: product.slug,
      squareVariationId: product.squareVariationId,
      title: product.name,
      body: product.shortDescription,
      href: `/products/${product.slug}`,
      image: product.imageUrl,
      imageAlt: product.name,
      badge: product.badge ?? item.badge
    });
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
          <p className="text-sm font-semibold">Editable items</p>
          <p className="mt-1 text-xs text-secondary">Cards, FAQ rows, badges, or support points for this section.</p>
        </div>
        <Button className="h-9 gap-2 px-3 text-xs" onClick={addItem} type="button" variant="secondary">
          <Plus aria-hidden="true" size={15} />
          Add
        </Button>
      </div>

      {storedItems.length === 0 && items.length > 0 ? <div className="rounded-md border border-border bg-surface p-3 text-xs text-secondary">Default cards are ready to edit. Uploading or changing any card will save this section as editable storefront content.</div> : null}
      {items.length === 0 ? <div className="rounded-md border border-dashed border-border bg-surface p-3 text-sm text-secondary">No items yet.</div> : null}

      <div className="grid gap-3">
        {items.map((item, index) => (
          <article className="grid gap-2 rounded-md border border-border bg-surface p-3" key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Item {index + 1}</p>
              <Button className="h-8 px-2 text-xs" onClick={() => removeItem(item.id)} type="button" variant="quiet">
                Remove
              </Button>
            </div>
            <ProductLinkSelect item={item} onSelect={(productSlug) => selectProductForItem(item, productSlug)} />
            <TextField label="Label" onChange={(label) => updateItem(item.id, { label })} value={item.label ?? ""} />
            <TextField label="Title" onChange={(title) => updateItem(item.id, { title })} value={item.title} />
            <TextArea label="Body" onChange={(body) => updateItem(item.id, { body })} rows={3} value={item.body ?? ""} />
            <TextField label="Link" onChange={(href) => updateItem(item.id, { href })} value={item.href ?? ""} />
            <TextField label="Badge" onChange={(badge) => updateItem(item.id, { badge })} value={item.badge ?? ""} />
            <div className="grid gap-2 rounded-md border border-border bg-surface-muted p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Card image</p>
              <EditablePresetImage alt={item.imageAlt || item.title} className="aspect-[4/3] rounded-md border border-border" src={item.image || ""} />
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
        ))}
      </div>
    </section>
  );
}

function ProductLinkSelect({ item, onSelect }: { item: HomepageSectionItem; onSelect: (productSlug: string) => void }) {
  const linkedProduct = item.productSlug ? storefrontProducts.find((product) => product.slug === item.productSlug) : null;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-muted p-3">
      <label className="grid gap-1 text-xs font-semibold">
        <span>Real product</span>
        <select className="min-h-9 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-normal outline-none focus:border-primary" onChange={(event) => onSelect(event.currentTarget.value)} value={item.productSlug ?? ""}>
          <option value="">Manual card / no product</option>
          {storefrontProducts.map((product) => (
            <option key={product.slug} value={product.slug}>
              {product.name} - {product.department}
            </option>
          ))}
        </select>
      </label>
      {linkedProduct ? (
        <div className="flex gap-3 rounded-md border border-border bg-surface p-2">
          <img alt={linkedProduct.name} className="h-14 w-14 rounded-md object-cover" src={linkedProduct.imageUrl} />
          <div className="min-w-0 text-xs">
            <p className="truncate font-semibold">{linkedProduct.name}</p>
            <p className="mt-1 text-secondary">{formatProductPrice(linkedProduct)} · links to /products/{linkedProduct.slug}</p>
            <p className="mt-1 text-secondary">Price, inventory, and add-to-cart stay connected to the product catalog.</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-secondary">Choose a product to turn this card into a real product card.</p>
      )}
    </div>
  );
}

function DesignPanel({ section, updateSection, focusRequest }: { section: HomepageSectionConfig; updateSection: (patch: Partial<HomepageSectionConfig>) => void; focusRequest: EditorFocusRequest | null }) {
  return (
    <div className="grid gap-4">
      <SelectField fieldId="textPosition" focusRequest={focusRequest} label="Text position" onChange={(textPosition) => updateSection({ textPosition: textPosition as HomepageSectionConfig["textPosition"] })} options={["left", "center", "right"]} value={section.textPosition ?? "left"} />
      <SelectField fieldId="mediaPlacement" focusRequest={focusRequest} label="Photo placement" onChange={(mediaPlacement) => updateSection({ mediaPlacement: mediaPlacement as HomepageSectionConfig["mediaPlacement"] })} options={["background", "left", "right", "none"]} value={section.mediaPlacement ?? "none"} />
      <SelectField label="Placeholder layout" onChange={(placeholderLayout) => updateSection({ placeholderLayout: placeholderLayout as HomepageSectionConfig["placeholderLayout"] })} options={["grid", "split", "rail", "stack"]} value={section.placeholderLayout ?? "grid"} />
      <SelectField fieldId="backgroundTone" focusRequest={focusRequest} label="Background" onChange={(backgroundTone) => updateSection({ backgroundTone: backgroundTone as HomepageSectionConfig["backgroundTone"] })} options={["default", "muted", "brand", "dark", "accent"]} value={section.backgroundTone ?? "default"} />
      <SelectField fieldId="contentWidth" focusRequest={focusRequest} label="Content width" onChange={(contentWidth) => updateSection({ contentWidth: contentWidth as HomepageSectionConfig["contentWidth"] })} options={["narrow", "normal", "wide"]} value={section.contentWidth ?? "wide"} />
      <SelectField fieldId="verticalPadding" focusRequest={focusRequest} label="Spacing" onChange={(verticalPadding) => updateSection({ verticalPadding: verticalPadding as HomepageSectionConfig["verticalPadding"] })} options={["compact", "normal", "spacious"]} value={section.verticalPadding ?? "normal"} />
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
        <Image aria-hidden="true" size={16} />
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

function formatProductPrice(product: StorefrontProduct) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(product.priceCents / 100);
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
        <Image aria-hidden="true" size={24} />
      </div>
    );
  }

  return <img alt={alt} className={cn("h-full w-full object-cover", className)} decoding="async" loading="lazy" onError={() => setFailed(true)} src={thumbnailImageUrl(src)} />;
}

function PlaceholderLayout({
  layout,
  section,
  onEditItems
}: {
  layout: NonNullable<HomepageSectionConfig["placeholderLayout"]>;
  section: HomepageSectionConfig;
  onEditItems: () => void;
}) {
  const labelsBySection: Record<string, string[]> = {
    "home.departments": ["Toys", "Party", "Balloons", "Gifts"],
    "home.featured-products": ["Product", "Product", "Product", "Product"],
    "home.balloon-promo": ["Latex", "Mylar", "Numbers", "Bouquets"],
    "home.local-storefront": ["86th Street", "3rd Avenue"]
  };
  const items = section.items?.length ? section.items : defaultEditableItemsForSection(section);
  const labels = items.length > 0 ? items.map((item) => item.title) : (labelsBySection[section.sectionId] ?? ["Block", "Block", "Block"]);
  const gridClass =
    layout === "rail"
      ? "grid-flow-col auto-cols-[180px] overflow-hidden"
      : layout === "split"
        ? "grid-cols-1 sm:grid-cols-2"
        : layout === "stack"
          ? "grid-cols-1"
          : section.columns === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : section.columns === 3
              ? "grid-cols-1 sm:grid-cols-3"
              : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className={cn("grid gap-3", gridClass)} onClick={(event) => preventAndEdit(event, onEditItems)}>
      {labels.map((label, index) => {
        const item = items[index];
        const linkedProduct = item?.productSlug ? storefrontProducts.find((product) => product.slug === item.productSlug) : null;
        const image = linkedProduct?.imageUrl ?? item?.image;
        const title = linkedProduct?.name ?? label;
        const body = linkedProduct?.shortDescription ?? item?.body;
        const badge = linkedProduct?.badge ?? item?.badge;

        return (
        <div className="group rounded-md border border-border bg-surface p-4 outline-offset-4 hover:outline hover:outline-2 hover:outline-primary" key={`${label}-${index}`}>
          {sectionTypeFromSection(section) !== "trust-bar" ? (
            <div className="relative mb-3">
              {image ? <EditablePresetImage alt={linkedProduct?.name || item?.imageAlt || item?.title || label} className="aspect-[4/3] rounded-md bg-surface-muted" src={image} /> : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-surface-muted text-secondary">
                  <Image aria-hidden="true" size={22} />
                </div>
              )}
              <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">Edit image</span>
            </div>
          ) : null}
          {badge ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{badge}</p> : null}
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-xs text-secondary">{body || (sectionTypeFromSection(section) === "faq" ? "Editable answer" : "Editable block")}</p>
          {linkedProduct ? <p className="mt-2 text-xs font-semibold">{formatProductPrice(linkedProduct)}</p> : null}
        </div>
        );
      })}
    </div>
  );
}

function PreviewMiniItems({ items, onClick, tone }: { items: HomepageSectionItem[]; onClick: () => void; tone: "dark" | "light" }) {
  return (
    <div className="mt-6 grid gap-2 sm:grid-cols-3" onClick={(event) => preventAndEdit(event, onClick)}>
      {items.slice(0, 3).map((item) => {
        const linkedProduct = item.productSlug ? storefrontProducts.find((product) => product.slug === item.productSlug) : null;

        return (
          <div className={cn("rounded-md border px-3 py-2 text-sm outline-offset-4 hover:outline hover:outline-2", tone === "dark" ? "border-white/25 bg-white/10 text-white hover:outline-white" : "border-border bg-surface-muted text-primary hover:outline-primary")} key={item.id}>
            <p className="font-semibold">{linkedProduct?.name ?? item.title}</p>
            {linkedProduct?.shortDescription || item.body ? <p className={cn("mt-1 text-xs", tone === "dark" ? "text-white/75" : "text-secondary")}>{linkedProduct?.shortDescription ?? item.body}</p> : null}
            {linkedProduct ? <p className="mt-1 text-xs font-semibold">{formatProductPrice(linkedProduct)}</p> : null}
          </div>
        );
      })}
    </div>
  );
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
    <label className="block text-sm font-semibold">
      {label}
      <input className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event) => onChange(event.target.value)} ref={inputRef} value={value} />
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
    <label className="block text-sm font-semibold">
      {label}
      <textarea className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event) => onChange(event.target.value)} ref={textareaRef} rows={rows} value={value} />
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
  options: string[];
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
    <label className="block text-sm font-semibold">
      {label}
      <select className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} ref={selectRef} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
    <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-semibold">
      {label}
      <input checked={checked} className="h-5 w-5 rounded border-border" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
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

function preventAndEdit(event: { preventDefault: () => void; stopPropagation: () => void }, callback: () => void) {
  event.preventDefault();
  event.stopPropagation();
  callback();
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

function sectionDescription(section: HomepageSectionConfig) {
  return sectionPurpose[section.sectionId] ?? sectionTypePurpose[sectionTypeFromSection(section)] ?? section.variant;
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

function previewModeLabel(previewMode: PreviewMode) {
  if (previewMode === "mobile") {
    return "Mobile canvas";
  }

  if (previewMode === "tablet") {
    return "Tablet canvas";
  }

  return "Desktop canvas";
}

function previewCanvasDesignWidth(previewMode: PreviewMode) {
  if (previewMode === "mobile") {
    return 390;
  }

  if (previewMode === "tablet") {
    return 760;
  }

  return 1120;
}

function previewPaddingClass(section: HomepageSectionConfig) {
  if (section.verticalPadding === "compact") {
    return "py-8";
  }

  if (section.verticalPadding === "spacious") {
    return "py-20";
  }

  return "py-12";
}

function previewToneClass(section: HomepageSectionConfig) {
  if (section.backgroundTone === "muted") {
    return "bg-surface-muted";
  }

  if (section.backgroundTone === "brand") {
    return "bg-primary text-[var(--theme-surface)]";
  }

  if (section.backgroundTone === "dark") {
    return "bg-primary text-white";
  }

  if (section.backgroundTone === "accent") {
    return "bg-[rgba(255,221,87,0.18)]";
  }

  return "bg-surface";
}

function previewBackgroundImage(section: HomepageSectionConfig) {
  return `linear-gradient(90deg, rgba(31, 41, 51, 0.72), rgba(31, 41, 51, 0.28)), url(${section.backgroundImage || defaultHomepageImage})`;
}

function previewBackgroundClass(section: HomepageSectionConfig) {
  return section.mediaPlacement === "left" ? "bg-left" : section.mediaPlacement === "right" ? "bg-right" : "bg-center";
}

function previewTextClass(section: HomepageSectionConfig) {
  return section.textPosition === "center" ? "mx-auto text-center" : section.textPosition === "right" ? "ml-auto text-right" : "text-left";
}

function previewTextWidthClass(section: HomepageSectionConfig) {
  return section.textPosition === "center" ? "mx-auto" : section.textPosition === "right" ? "ml-auto" : "";
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
