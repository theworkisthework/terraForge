/**
 * E2E: SVG import workflow.
 *
 * Tests the full Import SVG flow: click button → dialog mocked to return a
 * fixture → SVG parsed → appears in Properties panel → paths rendered on canvas.
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

// ─── Import SVG button baseline ──────────────────────────────────────────────

test("Import button is visible and enabled", async () => {
  const btn = window.locator("button:has-text('Import')");
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
});

// ─── Cancel dialog — nothing changes ────────────────────────────────────────

test("cancelling the SVG dialog keeps the canvas empty", async () => {
  await mockCancelDialog(electronApp);
  await window.locator("button:has-text('Import')").click();

  // Properties panel should still show the empty state
  const emptyMsg = window.locator("text=No objects. Import an SVG.");
  await expect(emptyMsg).toBeVisible({ timeout: 3000 });
});

// ─── Import the fixture SVG ─────────────────────────────────────────────────

test("importing sample.svg shows it in Properties panel", async () => {
  const svgPath = fixturePath("sample.svg");
  await mockOpenDialog(electronApp, svgPath);

  await window.locator("button:has-text('Import')").click();

  // Wait for the import name to appear in the Properties panel
  // The name is derived from the filename without extension → "sample"
  const importEntry = window.locator("text=sample").first();
  await expect(importEntry).toBeVisible({ timeout: 10_000 });
});

test("the empty state message disappears after import", async () => {
  const emptyMsg = window.locator("text=No objects. Import an SVG.");
  await expect(emptyMsg).not.toBeVisible();
});

test("Properties panel shows path count for the import", async () => {
  // The panel shows path count like "7p" (7 paths from sample.svg:
  // 1 path + 1 circle + 1 rect + 1 ellipse + 1 line + 1 polyline + 1 polygon)
  const pathCount = window.locator("text=/\\d+p/").first();
  await expect(pathCount).toBeVisible();
});

test("Generate G-code button becomes enabled after import", async () => {
  const btn = window.locator("button:has-text('Generate G-code')");
  await expect(btn).toBeEnabled();
});

// ─── SVG renders on canvas ──────────────────────────────────────────────────

test("imported SVG group appears on the canvas", async () => {
  // The PlotCanvas renders each import as a <g> with paths inside an SVG
  const svgPaths = window.locator("svg path");
  const count = await svgPaths.count();
  // sample.svg has 7 shape elements → 7 <path> elements on canvas (plus any bed grid)
  expect(count).toBeGreaterThanOrEqual(7);
});

// ─── Import a second SVG ────────────────────────────────────────────────────

test("importing a second SVG adds another entry in Properties", async () => {
  const svgPath = fixturePath("sample.svg");
  await mockOpenDialog(electronApp, svgPath);

  await window.locator("button:has-text('Import')").click();

  // Now there should be two "sample" entries in the Properties panel
  const entries = window.locator("text=sample");
  await expect(entries).toHaveCount(2, { timeout: 10_000 });
});

// ─── Properties panel selection ─────────────────────────────────────────────

test("clicking an import in Properties selects it (highlights)", async () => {
  // Click the first "sample" import entry
  const firstEntry = window.locator("text=sample").first();
  await firstEntry.click();

  // When selected, the Properties panel shows position/scale fields
  // Look for "X (mm)" label which only appears when an import is selected
  const xField = window.locator("text=X (mm)").first();
  await expect(xField).toBeVisible({ timeout: 3000 });
});

test("selected import shows dimension fields", async () => {
  const wField = window.locator("text=W (mm)").first();
  const hField = window.locator("text=H (mm)").first();
  const scaleField = window.locator("text=Scale").first();

  await expect(wField).toBeVisible();
  await expect(hField).toBeVisible();
  await expect(scaleField).toBeVisible();
});

// ─── Delete import ──────────────────────────────────────────────────────────

test("clicking delete button removes an import from Properties", async () => {
  // There should be 2 sample entries; delete one
  // Use title="Delete import" to target the import-level ✕ buttons only
  // (there are also path-level ✕ with title="Remove path")
  const importDeleteButtons = window.locator('button[title="Delete import"]');

  // Get count of "sample" entries before
  const beforeCount = await window.locator("text=sample").count();

  // Click the first import-level delete button
  await importDeleteButtons.first().click();

  // Wait for count to reduce
  await expect(window.locator("text=sample")).toHaveCount(beforeCount - 1, {
    timeout: 5000,
  });
});
