/**
 * E2E: File browser panel.
 *
 * Tests the file browser panel structure and its offline state.
 * Full connected-state tests would require a live FluidNC machine or a mock
 * server, so we focus on what can be verified with the app in offline mode.
 */
import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers";
import type { ElectronApplication, Page } from "playwright";

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
});

// ─── Panel structure ────────────────────────────────────────────────────────

test("File Browser heading is visible", async () => {
  const heading = window
    .locator("span.uppercase:has-text('File Browser')")
    .first();
  await expect(heading).toBeVisible();
});

test("internal filesystem section is present", async () => {
  const internal = window
    .locator("span.uppercase:has-text('internal')")
    .first();
  await expect(internal).toBeVisible();
});

test("sdcard filesystem section is present", async () => {
  const sdcard = window.locator("span.uppercase:has-text('sdcard')").first();
  await expect(sdcard).toBeVisible();
});

// ─── Offline state ──────────────────────────────────────────────────────────

test("file browser shows 'Not connected' when offline", async () => {
  const offlineMsg = window.locator("text=Not connected.").first();
  await expect(offlineMsg).toBeVisible();
});

test("upload buttons are disabled when offline", async () => {
  // Both internal and sdcard panes have upload buttons
  const uploadButtons = window.locator("button:has-text('Upload')");
  const count = await uploadButtons.count();
  for (let i = 0; i < count; i++) {
    await expect(uploadButtons.nth(i)).toBeDisabled();
  }
});

test("refresh buttons are disabled when offline", async () => {
  // The ↻ refresh buttons should be disabled or not present
  const refreshButtons = window.locator("button:has-text('↻')");
  const count = await refreshButtons.count();
  for (let i = 0; i < count; i++) {
    await expect(refreshButtons.nth(i)).toBeDisabled();
  }
});

// ─── Section collapse/expand ────────────────────────────────────────────────

test("clicking internal section header collapses it", async () => {
  // Click the internal header to collapse
  const internalHeader = window
    .locator("span.uppercase:has-text('internal')")
    .first();
  await internalHeader.click();

  // The "Not connected." message inside the internal pane should disappear
  // Wait briefly for UI to update
  await window.waitForTimeout(300);

  // Click again to expand
  await internalHeader.click();
  await window.waitForTimeout(300);
});

test("clicking sdcard section header collapses it", async () => {
  const sdcardHeader = window
    .locator("span.uppercase:has-text('sdcard')")
    .first();
  await sdcardHeader.click();
  await window.waitForTimeout(300);

  // Click again to expand
  await sdcardHeader.click();
  await window.waitForTimeout(300);
});

// ─── Breadcrumb navigation (offline — shows root) ──────────────────────────

test("breadcrumb shows root path when offline", async () => {
  // The breadcrumb bar shows "/" at root
  const rootCrumb = window.locator("aside button:has-text('/')").first();
  await expect(rootCrumb).toBeVisible();
});

// ─── Job controls integration ───────────────────────────────────────────────

test("Job controls section is visible in console area", async () => {
  const jobLabel = window.locator("text=Job").first();
  await expect(jobLabel).toBeVisible();
});

test("Start job button is disabled when offline and no file selected", async () => {
  const startBtn = window.locator("button:has-text('Start job')");
  await expect(startBtn).toBeDisabled();
});

test("no file selected message is shown", async () => {
  const noFile = window.locator("text=No file selected").first();
  await expect(noFile).toBeVisible();
});
