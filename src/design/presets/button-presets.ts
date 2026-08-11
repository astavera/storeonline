/**
 * Defines the reusable button presets preset for the storefront design system.
 */

export type ButtonPresetId = "primary" | "secondary" | "quiet" | "danger" | "accent";

export const buttonPresets: Record<ButtonPresetId, string> = {
  primary: "bg-[var(--theme-action)] text-[var(--theme-action-foreground)] hover:opacity-90",
  secondary: "border border-border bg-surface text-primary hover:bg-surface-muted",
  quiet: "text-primary hover:bg-surface-muted",
  danger: "bg-[var(--color-danger)] text-white",
  accent: "bg-[var(--theme-accent)] text-primary"
};
