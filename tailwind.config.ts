/**
 * Defines Tailwind content discovery and storefront design-system theme extensions.
 */

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        "surface-muted": "var(--color-surface-muted)",
        primary: "var(--color-text-primary)",
        secondary: "var(--color-text-secondary)",
        border: "var(--color-border)",
        navy: "var(--color-legacy-navy)",
        yellow: "var(--color-legacy-yellow)",
        red: "var(--color-legacy-red)",
        blue: "var(--color-legacy-blue)",
        cyan: "var(--color-legacy-cyan)",
        green: "var(--color-legacy-green)"
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)"
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)"
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-heading)", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
