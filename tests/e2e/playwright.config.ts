// @ts-check
import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for terraForge E2E tests.
 *
 * These tests launch the full Electron application via the _electron helper
 * and exercise critical user flows end-to-end.
 *
 * Prerequisites:
 *   npm run build          # produces out/main/index.js + renderer bundle
 *   npm run test:e2e       # builds then runs these specs
 *
 * Run standalone:
 *   npx playwright test --config=tests/e2e/playwright.config.ts
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1, // Electron tests must run serially — one app instance at a time
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
