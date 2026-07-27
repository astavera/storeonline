import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "3100", 10);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./src/tests/e2e",
  outputDir: "./.playwright-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: e2eBaseUrl,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] }
    }
  ],
  webServer: {
    // Webpack avoids a nondeterministic Turbopack task-graph panic that can
    // prevent the test server from starting after a production build.
    command: `npm run dev -- --webpack --hostname 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      DATABASE_URL: "",
      DIRECT_URL: "",
      ALLOW_LOCAL_PERSISTENCE_FALLBACK: "true",
      ADMIN_DEV_BYPASS: "true",
      E2E_CATALOG_FIXTURE: "true",
      SQUARE_CHECKOUT_ENABLED: "false",
      NEXT_DIST_DIR: ".next-e2e"
    }
  }
});
