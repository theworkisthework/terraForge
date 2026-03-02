/**
 * E2E: G-code generation workflow.
 *
 * Tests generating G-code from imported SVGs — both standard and optimised.
 * Also tests the G-code import feature (Import G-code button).
 *
 * This spec imports an SVG first (using dialog mocking), then exercises
 * the Generate G-code button and the split-button dropdown.
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

test("dropdown trigger (▾) is disabled with no imports", async () => {
  const dropdown = window.locator("button:has-text('▾')");
  await expect(dropdown).toBeDisabled();
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

test("clicking Generate G-code produces output (disconnected → save dialog)", async () => {
  const savePath = path.join(tempDir, "sample.gcode");
  await mockSaveDialog(electronApp, savePath);

  const btn = window.locator("button:has-text('Generate G-code')");
  await btn.click();

  // Wait for the generation to complete — button shows "Generating…" then reverts
  // We wait for the button text to return to "Generate G-code"
  await expect(btn).toHaveText("Generate G-code", { timeout: 30_000 });

  // The file should have been saved via the mocked dialog
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

// ─── Generate & optimise dropdown ───────────────────────────────────────────

test("dropdown trigger (▾) opens the optimise menu", async () => {
  const dropdown = window.locator("button:has-text('▾')");
  await dropdown.click();

  // The dropdown should show "Generate & optimise"
  const optimiseBtn = window.locator("text=Generate & optimise");
  await expect(optimiseBtn).toBeVisible({ timeout: 3000 });
});

test("clicking 'Generate & optimise' generates optimised G-code", async () => {
  const savePath = path.join(tempDir, "sample_opt.gcode");
  await mockSaveDialog(electronApp, savePath);

  // The dropdown should still be open from the previous test
  const optimiseBtn = window.locator("text=Generate & optimise");
  await optimiseBtn.click();

  // Wait for generation to complete
  const genBtn = window.locator("button:has-text('Generate G-code')");
  await expect(genBtn).toHaveText("Generate G-code", { timeout: 30_000 });

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
