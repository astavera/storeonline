/**
 * Configures opt-in live integration tests that communicate with external services.
 */

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/tests/live/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/tests/mocks/server-only.ts", import.meta.url))
    }
  }
});
