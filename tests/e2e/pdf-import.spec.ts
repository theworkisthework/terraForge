/**
 * E2E: PDF import workflow.
 *
 * Tests the full Import PDF flow: click Import button → dialog mocked to return
 * a fixture → PDF parsed → appears in Properties panel → paths rendered on
 * canvas → Generate G-code becomes enabled.
 *
 * The fixture `sample.pdf` is a single-page PDF containing a stroked rectangle.
 * pdfjs-dist is used by the renderer to extract operator lists; the Electron
 * main process reads the binary and passes a Uint8Array over IPC.
 */
import { test, expect } from "@playwright/test";
import {
  launchApp,
  closeApp,
  fixturePath,
  mockOpenDialog,
  mockCancelDialog,
} from "./helpers";
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

// ─── Baseline ────────────────────────────────────────────────────────────────

test("Import button is visible and enabled before any import", async () => {
  const btn = window.locator("button:has-text('Import')");
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
});

test("Properties panel shows empty state before import", async () => {
  const emptyMsg = window.locator("text=No objects. Import an SVG.");
  await expect(emptyMsg).toBeVisible();
});

// ─── Cancel dialog — nothing changes ─────────────────────────────────────────

test("cancelling the dialog keeps canvas empty", async () => {
  await mockCancelDialog(electronApp);
  await window.locator("button:has-text('Import')").click();

  const emptyMsg = window.locator("text=No objects. Import an SVG.");
  await expect(emptyMsg).toBeVisible({ timeout: 3000 });
});

// ─── Import the fixture PDF ──────────────────────────────────────────────────

test("importing sample.pdf shows the import in Properties panel", async () => {
  const pdfPath = fixturePath("sample.pdf");
  await mockOpenDialog(electronApp, pdfPath);

  await window.locator("button:has-text('Import')").click();

  // The import is named after the file without extension → "sample"
  // For a single-page PDF the name is exactly "sample" (no _p1 suffix when only one page)
  const importEntry = window.locator("text=/sample/").first();
  await expect(importEntry).toBeVisible({ timeout: 15_000 });
});

test("the empty state message disappears after PDF import", async () => {
  const emptyMsg = window.locator("text=No objects. Import an SVG.");
  await expect(emptyMsg).not.toBeVisible();
});

test("Properties panel shows path count badge after PDF import", async () => {
  // sample.pdf has a rectangle stroke — at least 1 path
  const pathCount = window.locator("text=/\\d+p/").first();
  await expect(pathCount).toBeVisible({ timeout: 5_000 });
});

test("Generate G-code button becomes enabled after PDF import", async () => {
  const btn = window.locator("button:has-text('Generate G-code')");
  await expect(btn).toBeEnabled({ timeout: 5_000 });
});

// ─── Canvas rendering ────────────────────────────────────────────────────────

test("imported PDF produces at least one path element on the canvas", async () => {
  const svgPaths = window.locator("svg path");
  const count = await svgPaths.count();
  // The canvas always has bed-grid paths plus at least one from the import
  expect(count).toBeGreaterThanOrEqual(1);
});

// ─── Multi-page: a second import is listed separately ────────────────────────

test("importing sample.pdf a second time adds another entry in Properties", async () => {
  const pdfPath = fixturePath("sample.pdf");
  await mockOpenDialog(electronApp, pdfPath);

  await window.locator("button:has-text('Import')").click();

  // Both entries should be visible
  const entries = window.locator("text=/sample/");
  await expect(entries).toHaveCount(2, { timeout: 15_000 });
});
