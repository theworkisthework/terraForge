// @ts-check
import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for terraForge E2E tests.
 *
 * These tests launch the full Electron application and exercise critical
 * user flows. They require a built app (`npm run build` first) and
 * `@playwright/test` + `electron` to be installed.
 *
 * Run with:
 *   npx playwright test --config=tests/e2e/playwright.config.ts
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  retries: 0,
  workers: 1, // Electron tests must run serially
  reporter: [["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
