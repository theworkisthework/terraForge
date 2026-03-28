/**
 * E2E: Application launch & basic smoke tests.
 *
 * Verifies the app boots, shows expected UI chrome, and responds to basic
 * interactions. This is the first spec that runs — if it fails, everything
 * else is unlikely to work.
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

// ─── Window chrome ───────────────────────────────────────────────────────────

test("app window opens and has a non-empty title", async () => {
  const title = await window.title();
  expect(title).toBeTruthy();
});

test("window has a reasonable minimum size", async () => {
  const { width, height } = await electronApp.evaluate(
    async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const [w, h] = win.getSize();
      return { width: w, height: h };
    },
  );
  expect(width).toBeGreaterThanOrEqual(1024);
  expect(height).toBeGreaterThanOrEqual(700);
});

// ─── Toolbar ─────────────────────────────────────────────────────────────────

test("toolbar renders with brand name", async () => {
  const brand = window.locator("text=terraForge").first();
  await expect(brand).toBeVisible();
});

test("machine selector dropdown is present and visible", async () => {
  const select = window.locator("select[aria-label='Machine selector']");
  await expect(select).toBeVisible();
});

test("machine selector has the default TerraPen option", async () => {
  const options = window.locator("select option");
  const texts = await options.allTextContents();
  // The default config includes "TerraPen (Default)"
  expect(texts.some((t) => t.includes("TerraPen"))).toBe(true);
});

test("Connect button is present when disconnected", async () => {
  const btn = window.locator("button:has-text('Connect')");
  await expect(btn).toBeVisible();
});

test("Import button is visible", async () => {
  const btn = window.locator("button:has-text('Import')");
  await expect(btn).toBeVisible();
});

test("Generate G-code button exists but is disabled with no imports", async () => {
  const btn = window.locator("button:has-text('Generate G-code')");
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
});

test("Home button is visible but disabled when offline", async () => {
  const btn = window.locator("button:has-text('Home')");
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
});

test("Jog button is visible", async () => {
  const btn = window.locator("button:has-text('Jog')");
  await expect(btn).toBeVisible();
});

test("settings gear button is present", async () => {
  const btn = window.locator("button:has-text('⚙')");
  await expect(btn).toBeVisible();
});

test("connection status shows Offline", async () => {
  const status = window.locator("text=Offline");
  await expect(status).toBeVisible();
});

// ─── Panels ──────────────────────────────────────────────────────────────────

test("file browser panel is visible", async () => {
  const panel = window
    .locator("span.uppercase:has-text('File Browser')")
    .first();
  await expect(panel).toBeVisible();
});

test("properties panel is visible", async () => {
  const panel = window.locator("text=Properties");
  await expect(panel).toBeVisible();
});

test("properties panel shows empty state message", async () => {
  const msg = window.locator("text=No objects. Import an SVG.");
  await expect(msg).toBeVisible();
});

test("console panel is visible", async () => {
  const panel = window.locator("span.uppercase:has-text('Console')").first();
  await expect(panel).toBeVisible();
});

test("console command input is disabled when offline", async () => {
  const input = window.locator('input[placeholder="Not connected"]');
  await expect(input).toBeVisible();
  await expect(input).toBeDisabled();
});

test("job controls section is visible", async () => {
  const label = window.locator("span.uppercase:has-text('Job')").first();
  await expect(label).toBeVisible();
});

test("start job button is disabled with no file selected", async () => {
  const btn = window.locator("button:has-text('Start job')");
  await expect(btn).toBeDisabled();
});

// ─── Canvas ──────────────────────────────────────────────────────────────────

test("SVG canvas element is present", async () => {
  const svg = window.locator("svg").first();
  await expect(svg).toBeVisible();
});

// ─── Jog panel toggle ────────────────────────────────────────────────────────

test("clicking Jog shows the jog controls panel, clicking again hides it", async () => {
  const jogBtn = window.locator("button:has-text('Jog')");
  const jogPanel = window.locator("text=Jog Controls").first();

  // Panel is open by default
  await expect(jogPanel).toBeVisible({ timeout: 3000 });

  // Close
  await jogBtn.click();
  await expect(jogPanel).not.toBeVisible({ timeout: 3000 });

  // Re-open
  await jogBtn.click();
  await expect(jogPanel).toBeVisible({ timeout: 3000 });
});
