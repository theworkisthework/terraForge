/**
 * E2E: G-code generation workflow.
 *
 * Tests generating G-code from imported SVGs — both standard and optimised.
 * Also tests the G-code import feature (Import G-code button).
 *
 * This spec imports an SVG first (using dialog mocking), then exercises
 * the Generate G-code button and the options dialog it opens.
 */
import { test, expect } from "@playwright/test";
import {
  launchApp,
  closeApp,
  fixturePath,
  mockOpenDialog,
  mockSaveDialog,
} from "./helpers";
import type { ElectronApplication, Page } from "playwright";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;
let tempDir: string;

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());

  // Create a temp directory for generated G-code output
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "terraforge-e2e-"));
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
  // Clean up temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ─── Generate button baseline (no imports) ──────────────────────────────────

test("Generate G-code button is disabled with no imports", async () => {
  const btn = window.locator("button:has-text('Generate G-code')");
  await expect(btn).toBeDisabled();
});

test("no split-button dropdown — single Generate G-code button only", async () => {
  // UI uses a single button that opens an options dialog; the old ▾ dropdown is gone
  const dropdown = window.locator("button:has-text('▾')");
  await expect(dropdown).toHaveCount(0);
});

// ─── Import an SVG to enable generation ──────────────────────────────────────

test("import SVG to enable G-code generation", async () => {
  const svgPath = fixturePath("sample.svg");
  await mockOpenDialog(electronApp, svgPath);

  await window.locator("button:has-text('Import SVG')").click();

  // Wait for import to complete — "sample" appears in Properties
  await expect(window.locator("text=sample").first()).toBeVisible({
    timeout: 10_000,
  });

  // Generate button should now be enabled
  const btn = window.locator("button:has-text('Generate G-code')");
  await expect(btn).toBeEnabled();
});

// ─── Generate standard G-code ───────────────────────────────────────────────

test("clicking Generate G-code opens dialog; choosing save locally produces output", async () => {
  const savePath = path.join(tempDir, "sample.gcode");

  const btn = window.locator("button:has-text('Generate G-code')");
  await btn.click();

  // Options dialog should appear — confirmed by its Cancel button
  const cancelBtn = window.locator("button:has-text('Cancel')");
  await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

  // Check "Save to computer" so the save dialog is triggered
  const saveCheckbox = window.locator(
    "label:has-text('Save to computer') input[type='checkbox']",
  );
  await saveCheckbox.check();

  // Mock the save dialog before confirming generation
  await mockSaveDialog(electronApp, savePath);

  // Click the dialog's Generate button (exact text "Generate", not "Generate G-code")
  const dialogGenerateBtn = window
    .locator("button")
    .filter({ hasText: /^Generate$/ });
  await dialogGenerateBtn.click();

  // Wait for the generation to complete — toolbar button reverts to "Generate G-code"
  await expect(btn).toHaveText("Generate G-code", { timeout: 30_000 });

  // Give a moment for the file write to complete
  await window.waitForTimeout(1000);

  // Check the file was created and has G-code content
  expect(fs.existsSync(savePath)).toBe(true);
  const content = fs.readFileSync(savePath, "utf-8");
  expect(content.length).toBeGreaterThan(0);
  // Should contain standard G-code commands
  expect(content).toContain("G");
  // Should contain pen up/down commands from the default config
  expect(content).toMatch(/M[35]/);
});

// ─── Options dialog ─────────────────────────────────────────────────────────

test("clicking Generate G-code opens the options dialog", async () => {
  const btn = window.locator("button:has-text('Generate G-code')");
  await btn.click();

  // Dialog should show the Optimise paths checkbox
  await expect(window.locator("text=Optimise paths")).toBeVisible({
    timeout: 3_000,
  });

  // Cancel to close without generating
  await window.locator("button:has-text('Cancel')").click();
  await expect(window.locator("text=Optimise paths")).not.toBeVisible({
    timeout: 3_000,
  });
});

test("generating with Optimise paths checked produces optimised G-code", async () => {
  const savePath = path.join(tempDir, "sample_opt.gcode");

  const btn = window.locator("button:has-text('Generate G-code')");
  await btn.click();

  // Wait for the options dialog to appear
  const cancelBtn = window.locator("button:has-text('Cancel')");
  await expect(cancelBtn).toBeVisible({ timeout: 5_000 });

  // Ensure Optimise paths is checked
  const optimiseCheckbox = window.locator(
    "label:has-text('Optimise paths') input[type='checkbox']",
  );
  await optimiseCheckbox.check();

  // Ensure Save to computer is checked so output is written to disk
  const saveCheckbox = window.locator(
    "label:has-text('Save to computer') input[type='checkbox']",
  );
  await saveCheckbox.check();

  // Mock the save dialog before clicking Generate in the dialog
  await mockSaveDialog(electronApp, savePath);

  // Click the dialog's Generate button
  const dialogGenerateBtn = window
    .locator("button")
    .filter({ hasText: /^Generate$/ });
  await dialogGenerateBtn.click();

  // Wait for generation to complete
  await expect(btn).toHaveText("Generate G-code", { timeout: 30_000 });

  await window.waitForTimeout(1000);

  expect(fs.existsSync(savePath)).toBe(true);
  const content = fs.readFileSync(savePath, "utf-8");
  expect(content.length).toBeGreaterThan(0);
  expect(content).toContain("G");
});

// ─── Import G-code ──────────────────────────────────────────────────────────

test("Import G-code button is visible", async () => {
  const btn = window.locator("button:has-text('Import G-code')");
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
});

test("importing a .gcode file selects it as the queued job", async () => {
  const gcodePath = fixturePath("sample.gcode");
  await mockOpenDialog(electronApp, gcodePath);

  await window.locator("button:has-text('Import G-code')").click();

  // The JobControls panel should now show the filename
  const jobFile = window.locator("text=sample.gcode").first();
  await expect(jobFile).toBeVisible({ timeout: 10_000 });
});
