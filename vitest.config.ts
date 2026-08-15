/**
 * Configures the default unit and integration test environment for Vitest.
 */

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/tests/unit/**/*.test.ts",
      "src/tests/unit/**/*.test.tsx",
      "src/tests/integration/**/*.test.ts",
      "src/tests/integration/**/*.test.tsx"
    ]
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/tests/mocks/server-only.ts", import.meta.url))
    }
  }
});
