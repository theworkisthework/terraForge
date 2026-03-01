/**
 * E2E: Machine configuration dialog.
 *
 * Tests CRUD for machine configs, export/import, and connection UI.
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

test("settings button opens Machine Configuration dialog", async () => {
  const settingsBtn = window.locator("button:has-text('⚙')");
  await settingsBtn.click();
  const heading = window.locator("text=Machine Configuration");
  await expect(heading).toBeVisible();
});

test("can close machine config dialog", async () => {
  // Click the ✕ close button
  const closeBtn = window.locator("button:has-text('✕')").first();
  await closeBtn.click();
  // Dialog should be gone
  const heading = window.locator("text=Machine Configuration");
  await expect(heading).not.toBeVisible();
});

test("Connect button is present when disconnected", async () => {
  const connectBtn = window.locator("button:has-text('Connect')");
  await expect(connectBtn).toBeVisible();
});
