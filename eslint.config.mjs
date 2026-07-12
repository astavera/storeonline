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
      "react-hooks/set-state-in-effect": "warn"
    }
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    ".playwright-results/**",
    "playwright-report/**",
    "public/uploads/admin/**",
    "next-env.d.ts"
  ])
]);
