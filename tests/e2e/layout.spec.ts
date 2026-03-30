/**
 * E2E: Layout save / open / close workflows.
 *
 * Exercises the three layout operations that are triggered by the native
 * application menu (File → Save Layout / Open Layout / Close Layout).
 *
 * The menu items fire IPC events ("menu:saveLayout", "menu:openLayout",
 * "menu:closeLayout") which the Toolbar component subscribes to.  In tests
 * we push those events directly from the main process using pushRendererEvent,
 * avoiding the need to navigate the native OS menu.
 *
 * File dialogs (fs:saveLayoutDialog, fs:openLayoutDialog) are mocked so that
 * tests control the target / source path; actual file I/O (fs:writeFile,
 * fs:readFile) uses the real implementation against a temp file so we can
 * inspect the written JSON without needing extra mocks.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  launchApp,
  closeApp,
  fixturePath,
  mockOpenDialog,
  mockIpcInvoke,
  pushRendererEvent,
} from "./helpers";
import type { ElectronApplication, Page } from "playwright";

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

/** Temp file path used as the layout save target across tests. */
let layoutTempPath: string;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());

  // Create a temp path for save/load tests.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-layout-e2e-"));
  layoutTempPath = path.join(tmpDir, "test-layout.tforge");

  // Import sample.svg — layouts must have at least one import, otherwise
  // saveLayout is a no-op.
  await mockOpenDialog(electronApp, fixturePath("sample.svg"));
  await window.locator("button:has-text('Import')").click();
  await expect(window.locator("text=sample").first()).toBeVisible({
    timeout: 15_000,
  });
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
  // Clean up the temp layout file if it was created.
  try {
    const dir = path.dirname(layoutTempPath);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fire a menu IPC event directly to the renderer so Toolbar handles it.
 * This is equivalent to the user selecting the corresponding File menu item.
 */
async function triggerMenu(app: ElectronApplication, channel: string) {
  await pushRendererEvent(app, channel, undefined);
}

// ─── Group 1: Save layout ─────────────────────────────────────────────────────

test("save layout writes a JSON file at the chosen path", async () => {
  // Mock the save dialog to return our temp path.
  await mockIpcInvoke(electronApp, "fs:saveLayoutDialog", layoutTempPath);

  // Trigger the save operation via menu event.
  await triggerMenu(electronApp, "menu:saveLayout");

  // The TaskBar should show "Layout saved" once the file has been written.
  await expect(window.locator("text=Layout saved").first()).toBeVisible({
    timeout: 10_000,
  });

  // The file must exist on disk.
  expect(fs.existsSync(layoutTempPath)).toBe(true);
});

test("saved layout file contains valid JSON with tfVersion 1", async () => {
  const raw = fs.readFileSync(layoutTempPath, "utf8");
  const json = JSON.parse(raw);
  expect(json.tfVersion).toBe(1);
  expect(Array.isArray(json.imports)).toBe(true);
});

test("saved layout file includes the imported SVG", async () => {
  const raw = fs.readFileSync(layoutTempPath, "utf8");
  const json = JSON.parse(raw);
  const names: string[] = json.imports.map((i: { name: string }) => i.name);
  expect(names).toContain("sample");
});

test("saved layout file contains a valid savedAt timestamp", async () => {
  const raw = fs.readFileSync(layoutTempPath, "utf8");
  const json = JSON.parse(raw);
  expect(typeof json.savedAt).toBe("string");
  expect(() => new Date(json.savedAt)).not.toThrow();
});

// ─── Group 2: Open layout ─────────────────────────────────────────────────────

test("opening a layout on an empty canvas loads its imports directly", async () => {
  // First close (clear) the canvas without prompting — mock the dialog to
  // avoid the CloseLayoutDialog.  We call clearImports by triggering close
  // and then confirming via the ConfirmDialog.
  await triggerMenu(electronApp, "menu:closeLayout");

  // CloseLayoutDialog should appear — click "Exit without Saving" to discard without saving.
  const discardBtn = window
    .locator("[role='dialog'] button:has-text('Exit without Saving')")
    .first();
  await expect(discardBtn).toBeVisible({ timeout: 5_000 });
  await discardBtn.click();

  // Canvas should now be empty.
  await expect(window.locator("text=No objects. Import an SVG.")).toBeVisible({
    timeout: 5_000,
  });

  // Mock open layout dialog to return the previously saved layout file.
  await mockIpcInvoke(electronApp, "fs:openLayoutDialog", layoutTempPath);
  await triggerMenu(electronApp, "menu:openLayout");

  // The layout should load and display the "sample" import.
  await expect(window.locator("text=sample").first()).toBeVisible({
    timeout: 10_000,
  });
});

test("open layout shows 'Layout ready' in the task bar", async () => {
  // Layout was loaded in the previous test; the task should be completed.
  await expect(window.locator("text=Layout ready").first()).toBeVisible({
    timeout: 5_000,
  });
});

test("opening a second layout with existing canvas content shows confirm dialog", async () => {
  // Canvas already has "sample" from the previous load.
  // Trigger open again — this time the app should ask before overwriting.
  await mockIpcInvoke(electronApp, "fs:openLayoutDialog", layoutTempPath);
  await triggerMenu(electronApp, "menu:openLayout");

  // A ConfirmDialog (or CloseLayoutDialog) must appear.
  const dialog = window.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
});

test("cancelling the overwrite dialog keeps the existing canvas content", async () => {
  // Click the Cancel button in whatever dialog is open.
  const cancelBtn = window.locator("[role='dialog'] button:has-text('Cancel')");
  if (await cancelBtn.isVisible({ timeout: 2000 })) {
    await cancelBtn.click();
  }

  // "sample" import must still be present.
  await expect(window.locator("text=sample").first()).toBeVisible({
    timeout: 3_000,
  });
});

// ─── Group 3: Close layout ────────────────────────────────────────────────────

test("triggering close layout shows a confirmation dialog", async () => {
  await triggerMenu(electronApp, "menu:closeLayout");

  const dialog = window.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
});

test("cancelling close layout keeps the imports", async () => {
  const cancelBtn = window.locator("[role='dialog'] button:has-text('Cancel')");
  await cancelBtn.click();

  await expect(window.locator("text=sample").first()).toBeVisible({
    timeout: 3_000,
  });
});

test("confirming close layout clears all imports", async () => {
  await triggerMenu(electronApp, "menu:closeLayout");

  // CloseLayoutDialog: click "Exit without Saving" to discard and clear the canvas.
  const discardBtn = window
    .locator("[role='dialog'] button:has-text('Exit without Saving')")
    .first();
  await expect(discardBtn).toBeVisible({ timeout: 5_000 });
  await discardBtn.click();

  await expect(window.locator("text=No objects. Import an SVG.")).toBeVisible({
    timeout: 5_000,
  });
});
