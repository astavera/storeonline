import type { SectionSettingsSchema } from "./cms-types";

export const contentSettings: SectionSettingsSchema["content"] = [
  { key: "eyebrow", label: "Eyebrow", type: "text" },
  { key: "title", label: "Title", type: "text", required: true },
  { key: "body", label: "Body", type: "textarea" },
  { key: "primaryCtaLabel", label: "Primary CTA label", type: "text" },
  { key: "primaryCtaHref", label: "Primary CTA link", type: "url" }
];

export const commerceContentSettings: SectionSettingsSchema["content"] = [
  ...contentSettings,
  { key: "badge", label: "Badge", type: "text" },
  { key: "emptyState", label: "Empty state", type: "textarea" }
];

export const mediaSettings: SectionSettingsSchema["media"] = [
  { key: "image", label: "Image", type: "image" },
  { key: "imageAlt", label: "Image alt text", type: "text" },
  { key: "videoUrl", label: "Video URL", type: "url" }
];

export const designSettings: SectionSettingsSchema["design"] = [
  { key: "backgroundColor", label: "Background color", type: "color" },
  { key: "textColor", label: "Text color", type: "color" },
  { key: "accentColor", label: "Accent color", type: "color" },
  { key: "backgroundTone", label: "Background tone", type: "select", options: ["default", "muted", "brand", "dark", "accent"] },
  { key: "radius", label: "Radius", type: "select", options: ["none", "small", "medium", "large", "pill"] },
  { key: "shadow", label: "Shadow", type: "select", options: ["none", "soft", "medium", "strong"] },
  { key: "buttonStyle", label: "Button style", type: "select", options: ["solid", "outline", "ghost", "link"] }
];

export const layoutSettings: SectionSettingsSchema["layout"] = [
  { key: "alignment", label: "Alignment", type: "select", options: ["left", "center", "right"] },
  { key: "containerWidth", label: "Container width", type: "select", options: ["narrow", "normal", "wide", "full"] },
  { key: "paddingTop", label: "Padding top", type: "number" },
  { key: "paddingBottom", label: "Padding bottom", type: "number" },
  { key: "columns", label: "Columns", type: "number" },
  { key: "imagePosition", label: "Image position", type: "select", options: ["left", "right", "background", "none"] }
];

export const dataSourceSettings: SectionSettingsSchema["dataSource"] = [
  {
    key: "type",
    label: "Data source",
    type: "dataSource",
    options: ["manual", "productCollection", "department", "holiday", "squareCatalog", "productPlacement", "relatedProducts", "latestProducts", "featuredProducts", "recentlyViewed", "locationData", "blogPosts", "policyContent", "custom"]
  },
  { key: "id", label: "Source ID", type: "text" },
  { key: "limit", label: "Limit", type: "number" }
];

export const visibilitySettings: SectionSettingsSchema["visibility"] = [
  { key: "desktop", label: "Show on desktop", type: "toggle" },
  { key: "tablet", label: "Show on tablet", type: "toggle" },
  { key: "mobile", label: "Show on mobile", type: "toggle" }
];

export const advancedSettings: SectionSettingsSchema["advanced"] = [
  { key: "anchorId", label: "Anchor ID", type: "text" },
  { key: "customClassName", label: "Custom class", type: "text", helpText: "Use only approved utility classes." },
  { key: "safeRichTextHtml", label: "Safe rich text", type: "richText", helpText: "Scripts and unsafe embeds require security review." }
];

export const baseSectionSettingsSchema: SectionSettingsSchema = {
  content: contentSettings,
  design: designSettings,
  layout: layoutSettings,
  media: mediaSettings,
  dataSource: dataSourceSettings,
  visibility: visibilitySettings,
  advanced: advancedSettings
};

export const commerceSectionSettingsSchema: SectionSettingsSchema = {
  ...baseSectionSettingsSchema,
  content: commerceContentSettings
};
