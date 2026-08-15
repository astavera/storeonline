/**
 * Defines the reusable product grid presets preset for the storefront design system.
 */

export type ProductGridPresetId =
  | "compact"
  | "editorial"
  | "balloons"
  | "featured-carousel"
  | "admin-table"
  | "category-card"
  | "department-card"
  | "holiday-card"
  | "mobile-first";

export const productGridPresets: Record<ProductGridPresetId, string> = {
  compact: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4",
  editorial: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6",
  balloons: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5",
  "featured-carousel": "grid-flow-col auto-cols-[72%] sm:auto-cols-[38%] lg:auto-cols-[24%] overflow-x-auto gap-5",
  "admin-table": "grid-cols-1 gap-3",
  "category-card": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5",
  "department-card": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5",
  "holiday-card": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5",
  "mobile-first": "grid-cols-2 md:grid-cols-3 gap-4"
};
