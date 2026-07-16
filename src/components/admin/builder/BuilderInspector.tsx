"use client";

import { Database, Eye, History, Image, LayoutDashboard, Palette, PanelRight, Search, Settings2, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdvancedInspector } from "@/components/admin/inspector/AdvancedInspector";
import { ContentInspector } from "@/components/admin/inspector/ContentInspector";
import { DataSourceInspector } from "@/components/admin/inspector/DataSourceInspector";
import { DesignInspector } from "@/components/admin/inspector/DesignInspector";
import { LayoutInspector } from "@/components/admin/inspector/LayoutInspector";
import { MediaInspector } from "@/components/admin/inspector/MediaInspector";
import { PresetInspector } from "@/components/admin/inspector/PresetInspector";
import { SeoInspector } from "@/components/admin/inspector/SeoInspector";
import { ThemeInspector } from "@/components/admin/inspector/ThemeInspector";
import { VisibilityInspector } from "@/components/admin/inspector/VisibilityInspector";
import type { CmsPageDocument, CmsSection, SectionPreset, ThemePreset, ThemeTokenOverrides } from "@/lib/cms";
import { cn } from "@/lib/utils";
import { BuilderHistoryPanel } from "./BuilderHistoryPanel";
import type { BuilderDocumentHistoryEntry, BuilderInspectorTab } from "./types";

const tabs: Array<{ id: BuilderInspectorTab; label: string; icon: typeof PanelRight }> = [
  { id: "content", label: "Content", icon: PanelRight },
  { id: "design", label: "Design", icon: SlidersHorizontal },
  { id: "media", label: "Media", icon: Image },
  { id: "layout", label: "Layout", icon: LayoutDashboard },
  { id: "data", label: "Data", icon: Database },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "presets", label: "Presets", icon: Sparkles },
  { id: "seo", label: "SEO", icon: Search },
  { id: "visibility", label: "Visibility", icon: Eye },
  { id: "advanced", label: "Advanced", icon: Settings2 },
  { id: "history", label: "History", icon: History }
];

export function BuilderInspector({
  activeTab,
  document,
  history,
  onApplySectionPreset,
  onApplyThemePreset,
  onDone,
  selectedSection,
  setActiveTab,
  updateSection,
  updateSeo,
  updateTheme
}: {
  activeTab: BuilderInspectorTab;
  document: CmsPageDocument;
  history: BuilderDocumentHistoryEntry[];
  onApplySectionPreset: (preset: SectionPreset) => void;
  onApplyThemePreset: (preset: ThemePreset) => void;
  onDone: () => void;
  selectedSection: CmsSection;
  setActiveTab: (tab: BuilderInspectorTab) => void;
  updateSection: (patch: Partial<CmsSection>) => void;
  updateSeo: (seo: Partial<CmsPageDocument["seo"]>) => void;
  updateTheme: (theme: ThemeTokenOverrides) => void;
}) {
  return (
    <aside>
      <div className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
        <h2 className="truncate font-display text-lg font-semibold">{activeTab === "seo" ? "Page SEO" : selectedSection.label}</h2>
        <Button className="h-10 shrink-0 rounded-full px-4" onClick={onDone} variant="quiet">
          Done
        </Button>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              className={cn("inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-semibold text-secondary transition hover:bg-surface-muted hover:text-primary", activeTab === tab.id && "bg-primary text-white hover:bg-primary hover:text-white")}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab === "content" ? <ContentInspector section={selectedSection} updateSection={updateSection} /> : null}
      {activeTab === "design" ? <DesignInspector section={selectedSection} updateSection={updateSection} /> : null}
      {activeTab === "media" ? <MediaInspector section={selectedSection} updateSection={updateSection} /> : null}
      {activeTab === "layout" ? <LayoutInspector section={selectedSection} updateSection={updateSection} /> : null}
      {activeTab === "data" ? <DataSourceInspector section={selectedSection} updateSection={updateSection} /> : null}
      {activeTab === "theme" ? <ThemeInspector document={document} updateTheme={updateTheme} /> : null}
      {activeTab === "presets" ? <PresetInspector applySectionPreset={onApplySectionPreset} applyThemePreset={onApplyThemePreset} selectedSection={selectedSection} /> : null}
      {activeTab === "seo" ? <SeoInspector document={document} updateSeo={updateSeo} /> : null}
      {activeTab === "visibility" ? <VisibilityInspector section={selectedSection} updateSection={updateSection} /> : null}
      {activeTab === "advanced" ? <AdvancedInspector section={selectedSection} updateSection={updateSection} /> : null}
      {activeTab === "history" ? <BuilderHistoryPanel history={history} /> : null}
    </aside>
  );
}
