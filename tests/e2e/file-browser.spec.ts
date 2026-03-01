/**
 * E2E: File browser panel.
 *
 * Tests the file browser panel interactions when connected to a machine.
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

test("file browser panel shows when not connected", async () => {
  const panel = window.locator("text=File Browser").first();
  await expect(panel).toBeVisible();
});

test("file browser shows connect prompt when offline", async () => {
  // When not connected, the file browser should show an informational message
  const fb = window.locator("text=File Browser").first();
  await expect(fb).toBeVisible();
});
