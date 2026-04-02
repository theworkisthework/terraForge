// @ts-check
import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for the screenshot-capture suite only.
 * Unlike playwright.config.ts, this does NOT ignore take-screenshots.spec.ts.
 *
 * Run via:
 *   npm run doc:screenshots
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/take-screenshots.spec.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
});
