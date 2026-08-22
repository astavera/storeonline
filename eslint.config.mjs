/**
 * Defines lint rules, generated-file exclusions, and project-specific ESLint overrides.
 */

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // Existing editors hydrate browser-only state in effects. Keep this debt visible
      // without blocking the Phase 0 toolchain migration.
      "@next/next/no-assign-module-variable": "off",
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react/no-unescaped-entities": "off"
    }
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/orderpro", "@/server/orderpro/**"],
              message: "OrderPRO credentials and bearer tokens are restricted to the storefront backend."
            }
          ]
        }
      ]
    }
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    ".next-*/**",
    "out/**",
    "output/**",
    "orderpro-source/**",
    "build/**",
    "backups/**",
    "coverage/**",
    ".codex-logs/**",
    ".playwright-cli/**",
    ".playwright-results/**",
    "playwright-report/**",
    "test-results/**",
    "public/uploads/admin/**",
    "next-env.d.ts"
  ])
]);
