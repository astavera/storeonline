import type { ThemeTokenOverrides, ThemeTokens } from "./cms-types";

export const defaultThemeTokens: ThemeTokens = {
  colors: {
    primary: "#13233a",
    secondary: "#334155",
    accent: "#f6c945",
    background: "#ffffff",
    surface: "#ffffff",
    muted: "#f5f2ed",
    border: "#ddd7ca",
    text: "#111827",
    success: "#15803d",
    warning: "#b45309",
    danger: "#b91c1c"
  },
  typography: {
    headingFont: "var(--font-heading)",
    bodyFont: "var(--font-body)",
    headingScale: "standard",
    bodyScale: "standard",
    lineHeight: "normal",
    letterSpacing: "normal",
    headingWeight: 650,
    bodyWeight: 400
  },
  spacing: {
    sectionPadding: 56,
    containerPadding: 16,
    gridGap: 20,
    cardPadding: 20,
    buttonPaddingX: 18,
    buttonPaddingY: 12,
    mobileScale: 0.78
  },
  radius: "medium",
  shadows: "soft",
  buttons: {
    style: "solid",
    radius: "medium",
    uppercase: false,
    iconPosition: "none",
    hover: "lift"
  },
  cards: {
    border: true,
    shadow: "soft",
    radius: "medium",
    imageRatio: "4:3",
    imageHover: "zoom",
    contentAlignment: "left",
    badgePosition: "top-left"
  },
  grid: {
    desktopColumns: 4,
    tabletColumns: 2,
    mobileColumns: 1,
    gap: 20,
    containerWidth: "wide",
    mobileBehavior: "stack"
  },
  animation: "fade",
  images: {
    aspectRatio: "4:3",
    objectFit: "cover",
    radius: "medium",
    overlay: "none",
    opacity: 1
  }
};

export function mergeThemeTokens(base: ThemeTokens, override?: ThemeTokenOverrides): ThemeTokens {
  if (!override) {
    return base;
  }

  return {
    colors: { ...base.colors, ...override.colors },
    typography: { ...base.typography, ...override.typography },
    spacing: { ...base.spacing, ...override.spacing },
    radius: override.radius ?? base.radius,
    shadows: override.shadows ?? base.shadows,
    buttons: { ...base.buttons, ...override.buttons },
    cards: { ...base.cards, ...override.cards },
    grid: { ...base.grid, ...override.grid },
    animation: override.animation ?? base.animation,
    images: { ...base.images, ...override.images }
  };
}
