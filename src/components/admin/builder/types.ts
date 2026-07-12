import type { CmsPageDocument, CmsScope, CmsSection } from "@/lib/cms";

export type BuilderDevice = "desktop" | "tablet" | "mobile";

export type BuilderInspectorTab = "content" | "design" | "media" | "layout" | "data" | "theme" | "presets" | "seo" | "visibility" | "advanced" | "history";

export type BuilderSaveState = {
  tone: "idle" | "success" | "error";
  message: string;
};

export type BuilderDocumentHistoryEntry = {
  version: number;
  status: string;
  title: string;
  updatedAt: string;
};

export type BuilderPanelProps = {
  document: CmsPageDocument;
  selectedSection: CmsSection;
  selectedSectionId: string;
  scope: CmsScope;
  onSelectSection: (sectionId: string) => void;
  updateDocument: (document: CmsPageDocument) => void;
};
