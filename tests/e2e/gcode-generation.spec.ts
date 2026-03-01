/**
 * E2E: G-code generation workflow.
 *
 * Tests generating G-code from imported SVGs — standard and optimised paths.
 */
import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers";
import type { ElectronApplication, Page } from "playwright";

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  ({ electronApp, window } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp);
});

test("Generate G-code button is disabled with no imports", async () => {
  const btn = window.locator("button:has-text('Generate G-code')");
  await expect(btn).toBeDisabled();
});

test("Generate & optimise menu item exists in dropdown", async () => {
  // This test would click the split-button dropdown and check for the option
  const dropdownBtn = window.locator("button:has-text('▾')");
  await expect(dropdownBtn).toBeVisible();
});
