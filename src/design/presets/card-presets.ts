/**
 * Defines the reusable card presets preset for the storefront design system.
 */

export type ProductCardVariant = "minimal" | "premium" | "image-focused" | "balloons" | "compact" | "horizontal" | "admin";

export const cardPresets: Record<ProductCardVariant, string> = {
  minimal: "border border-border bg-surface",
  premium: "border border-border bg-surface",
  "image-focused": "bg-surface shadow-card",
  balloons: "border border-border bg-surface shadow-card",
  compact: "border border-border bg-surface",
  horizontal: "border border-border bg-surface md:flex",
  admin: "border border-border bg-surface-muted"
};
