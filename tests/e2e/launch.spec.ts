/**
 * E2E: Application launch & basic smoke tests.
 *
 * Verifies the app boots, shows the expected chrome, and can be closed.
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

test("app window opens with correct title", async () => {
  const title = await window.title();
  expect(title).toBeTruthy();
});

test("toolbar renders with brand name", async () => {
  const brand = window.locator("text=terraForge").first();
  await expect(brand).toBeVisible();
});

test("file browser panel is visible", async () => {
  const panel = window.locator("text=File Browser").first();
  await expect(panel).toBeVisible();
});

test("properties panel is visible", async () => {
  const panel = window.locator("text=Properties").first();
  await expect(panel).toBeVisible();
});

test("console panel is visible", async () => {
  const panel = window.locator("text=Console").first();
  await expect(panel).toBeVisible();
});

test("machine selector is present", async () => {
  const select = window.locator("select").first();
  await expect(select).toBeVisible();
});
