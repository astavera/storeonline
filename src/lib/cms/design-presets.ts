/**
 * Provides shared design presets types and utilities for the application.
 */

import type { ButtonPreset, CardPreset, LayoutPreset, SectionPreset, ThemePreset } from "./cms-types";

export const themePresets: ThemePreset[] = [
  {
    id: "editorial-nyc",
    label: "Editorial NYC",
    description: "A crisp neighborhood retail look with newspaper-like hierarchy.",
    tokens: {
      colors: { primary: "#111827", secondary: "#475569", accent: "#f4c542", background: "#ffffff", surface: "#ffffff", muted: "#f3f4f6", border: "#d1d5db", text: "#111827", success: "#15803d", warning: "#b45309", danger: "#b91c1c" },
      typography: { headingFont: "var(--font-heading)", bodyFont: "var(--font-body)", headingScale: "editorial", bodyScale: "standard", lineHeight: "normal", letterSpacing: "normal", headingWeight: 700, bodyWeight: 400 }
    }
  },
  {
    id: "minimal-luxury",
    label: "Minimal Luxury",
    description: "Quiet spacing, restrained contrast and refined product presentation.",
    tokens: {
      colors: { primary: "#0f172a", secondary: "#64748b", accent: "#c8a45d", background: "#fbfaf7", surface: "#ffffff", muted: "#f4f1eb", border: "#ded8ca", text: "#111827", success: "#166534", warning: "#a16207", danger: "#991b1b" },
      radius: "small",
      shadows: "none"
    }
  },
  {
    id: "modern-florist",
    label: "Modern Florist",
    description: "Soft color and airy cards for gifts, flowers and seasonal displays.",
    tokens: {
      colors: { primary: "#18362f", secondary: "#52645d", accent: "#ff7aa2", background: "#fffaf7", surface: "#ffffff", muted: "#f4ebe5", border: "#ead8cf", text: "#17211f", success: "#15803d", warning: "#b45309", danger: "#be123c" },
      cards: { border: true, shadow: "soft", radius: "medium", imageRatio: "4:3", imageHover: "zoom", contentAlignment: "left", badgePosition: "top-left" }
    }
  },
  {
    id: "bold-promo",
    label: "Bold Promo",
    description: "High-contrast campaign styling for sales, launches and announcements.",
    tokens: {
      colors: { primary: "#101010", secondary: "#4b5563", accent: "#ff5a1f", background: "#ffffff", surface: "#ffffff", muted: "#f3f4f6", border: "#d1d5db", text: "#111827", success: "#15803d", warning: "#c2410c", danger: "#dc2626" },
      buttons: { style: "solid", radius: "pill", uppercase: true, iconPosition: "right", hover: "fill" }
    }
  },
  {
    id: "clean-marketplace",
    label: "Clean Marketplace",
    description: "Dense product grids, clear cards and reliable ecommerce scanning.",
    tokens: {
      grid: { desktopColumns: 4, tabletColumns: 3, mobileColumns: 2, gap: 16, containerWidth: "wide", mobileBehavior: "stack" },
      cards: { border: true, shadow: "none", radius: "small", imageRatio: "1:1", imageHover: "none", contentAlignment: "left", badgePosition: "top-left" }
    }
  },
  {
    id: "soft-boutique",
    label: "Soft Boutique",
    description: "Warm and approachable visual system for giftable products.",
    tokens: {
      colors: { primary: "#2f2a24", secondary: "#6b6258", accent: "#e87972", background: "#fffaf2", surface: "#ffffff", muted: "#f6eee2", border: "#eadccb", text: "#211c17", success: "#15803d", warning: "#b45309", danger: "#b91c1c" },
      radius: "large"
    }
  },
  {
    id: "holiday-campaign",
    label: "Holiday Campaign",
    description: "Seasonal emphasis with rich accents and generous hero spacing.",
    tokens: {
      colors: { primary: "#17352f", secondary: "#5f6f6b", accent: "#d62828", background: "#ffffff", surface: "#ffffff", muted: "#f0f5f2", border: "#cfded7", text: "#13201d", success: "#15803d", warning: "#b45309", danger: "#b91c1c" },
      animation: "fade"
    }
  },
  {
    id: "local-delivery",
    label: "Local Delivery",
    description: "Operationally clear styling for pickup, delivery and local SEO pages.",
    tokens: {
      colors: { primary: "#123047", secondary: "#526476", accent: "#2fbf71", background: "#ffffff", surface: "#ffffff", muted: "#edf6f2", border: "#cfe5dc", text: "#10202c", success: "#15803d", warning: "#b45309", danger: "#b91c1c" },
      grid: { desktopColumns: 3, tabletColumns: 2, mobileColumns: 1, gap: 18, containerWidth: "wide", mobileBehavior: "stack" }
    }
  },
  {
    id: "premium-gift-shop",
    label: "Premium Gift Shop",
    description: "Higher-end gift presentation with polished media and soft shadows.",
    tokens: {
      colors: { primary: "#1f2937", secondary: "#6b7280", accent: "#a855f7", background: "#ffffff", surface: "#ffffff", muted: "#f5f3ff", border: "#ddd6fe", text: "#111827", success: "#15803d", warning: "#b45309", danger: "#b91c1c" },
      shadows: "medium",
      images: { aspectRatio: "4:3", objectFit: "cover", radius: "medium", overlay: "none", opacity: 1 }
    }
  },
  {
    id: "newsstand-editorial",
    label: "Newsstand Editorial",
    description: "Strong headlines and straightforward content bands for local retail storytelling.",
    tokens: {
      colors: { primary: "#0b1220", secondary: "#475569", accent: "#2563eb", background: "#ffffff", surface: "#ffffff", muted: "#eff6ff", border: "#bfdbfe", text: "#0f172a", success: "#15803d", warning: "#b45309", danger: "#b91c1c" },
      typography: { headingFont: "var(--font-heading)", bodyFont: "var(--font-body)", headingScale: "display", bodyScale: "comfortable", lineHeight: "normal", letterSpacing: "normal", headingWeight: 750, bodyWeight: 400 }
    }
  }
];

export const sectionPresets: SectionPreset[] = [
  {
    id: "hero-split-commerce",
    label: "Split commerce hero",
    description: "Two-column ecommerce hero with media on the right.",
    sectionTypes: ["hero", "holidayHero", "locationHero"],
    layout: { columns: 2, imagePosition: "right", paddingTop: 96, paddingBottom: 96, placeholderLayout: "split" },
    design: { backgroundTone: "default", buttonStyle: "solid" }
  },
  {
    id: "product-grid-dense",
    label: "Dense product grid",
    description: "A compact marketplace-style product grid.",
    sectionTypes: ["productGrid", "productCarousel", "featuredProducts", "product-grid"],
    layout: { columns: 4, containerWidth: "wide", paddingTop: 48, paddingBottom: 48 },
    design: { cardStyle: "bordered", shadow: "none" }
  },
  {
    id: "trust-strip",
    label: "Trust strip",
    description: "Compact row of trust badges.",
    sectionTypes: ["trustBar", "trustBadges", "trust-bar", "secureCheckoutBadges"],
    layout: { columns: 4, paddingTop: 24, paddingBottom: 24, placeholderLayout: "rail" },
    design: { backgroundTone: "brand", shadow: "none" }
  }
];

export const layoutPresets: LayoutPreset[] = [
  { id: "wide-standard", label: "Wide standard", layout: { containerWidth: "wide", paddingTop: 56, paddingBottom: 56, columns: 3 } },
  { id: "narrow-editorial", label: "Narrow editorial", layout: { containerWidth: "narrow", paddingTop: 72, paddingBottom: 72, columns: 1 } },
  { id: "full-bleed-hero", label: "Full bleed hero", layout: { containerWidth: "full", paddingTop: 104, paddingBottom: 104, columns: 2, imagePosition: "background" } }
];

export const cardPresets: CardPreset[] = [
  { id: "plain", label: "Plain", card: { border: false, shadow: "none", radius: "small", imageRatio: "4:3", imageHover: "none", contentAlignment: "left", badgePosition: "top-left" } },
  { id: "elevated", label: "Elevated", card: { border: true, shadow: "soft", radius: "medium", imageRatio: "4:3", imageHover: "zoom", contentAlignment: "left", badgePosition: "top-left" } },
  { id: "square-product", label: "Square product", card: { border: true, shadow: "none", radius: "small", imageRatio: "1:1", imageHover: "none", contentAlignment: "left", badgePosition: "top-left" } }
];

export const buttonPresets: ButtonPreset[] = [
  { id: "solid", label: "Solid", button: { style: "solid", radius: "medium", uppercase: false, iconPosition: "none", hover: "lift" } },
  { id: "outline-pill", label: "Outline pill", button: { style: "outline", radius: "pill", uppercase: false, iconPosition: "right", hover: "fill" } },
  { id: "editorial-link", label: "Editorial link", button: { style: "link", radius: "none", uppercase: false, iconPosition: "right", hover: "underline" } }
];
