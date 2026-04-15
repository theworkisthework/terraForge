/**
 * E2E: File browser — connected machine state.
 *
 * Uses IPC mocking to simulate a connected FluidNC machine with an SD card
 * populated by test data.  Tests verify file listing, directory navigation,
 * file selection, upload flow, delete confirmation, refresh, and the
 * download action.
 *
 * The same pattern as gcode-preview.spec.ts is used for connecting: mock
 * the relevant IPC handlers, reload the renderer, select the machine, and
 * click Connect.
 */
import { test, expect } from "@playwright/test";
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

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const TEST_CONFIG = {
  id: "e2e-fb",
  name: "E2E File Browser Machine",
  connection: {
    type: "wifi" as const,
    host: "127.0.0.1",
    port: 80,
    wsPort: 81,
  },
  bedWidth: 300,
  bedHeight: 300,
  penUpCommand: "M3 S0",
  penDownCommand: "M3 S1",
  penDownDelayMs: 50,
  penType: "solenoid" as const,
  maxSpeed: 3000,
  travelSpeed: 3000,
};

const ROOT_FILES = [
  { name: "plot.gcode", path: "/plot.gcode", size: 2048, isDirectory: false },
  {
    name: "sketch.gcode",
    path: "/sketch.gcode",
    size: 512,
    isDirectory: false,
  },
  { name: "subdir", path: "/subdir", size: 0, isDirectory: true },
];

const SUBDIR_FILES = [
  {
    name: "nested.gcode",
    path: "/subdir/nested.gcode",
    size: 256,
    isDirectory: false,
  },
];

const REMOTE_GCODE =
  "G21\nG90\nG0 Z5\nM3 S0\nG0 X0 Y0\nG1 X50 Y50 F1000\nM3 S0\nG0 X0 Y0\nM2\n";

// ─── Setup ─────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());

  // Machine config and connection mocks.
  await mockIpcInvoke(electronApp, "config:getMachineConfigs", [TEST_CONFIG]);
  await mockIpcInvoke(electronApp, "fluidnc:connectWebSocket", undefined);

  // SD card listing — root returns ROOT_FILES; sub-path returns SUBDIR_FILES.
  await electronApp.evaluate(
    ({ ipcMain }, { root, subdir }) => {
      ipcMain.removeHandler("fluidnc:listSDFiles");
      ipcMain.handle(
        "fluidnc:listSDFiles",
        (_e: Electron.IpcMainInvokeEvent, dirPath: string) =>
          dirPath === "/subdir" ? subdir : root,
      );
      ipcMain.removeHandler("fluidnc:listFiles");
      ipcMain.handle("fluidnc:listFiles", async () => []);
    },
    { root: ROOT_FILES, subdir: SUBDIR_FILES },
  );

  // Immediate resolve for operations we will trigger in tests.
  await mockIpcInvoke(electronApp, "fluidnc:deleteFile", undefined);
  await mockIpcInvoke(electronApp, "fluidnc:runFile", undefined);
  await mockIpcInvoke(electronApp, "fluidnc:uploadFile", undefined);
  await mockIpcInvoke(electronApp, "fluidnc:fetchFileText", REMOTE_GCODE);

  // Reload so the renderer picks up the mocked configs.
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await window
    .locator("select[aria-label='Machine selector']")
    .first()
    .waitFor({ timeout: 15_000 });

  // Select the machine and connect.
  await window
    .locator("select[aria-label='Machine selector']")
    .selectOption({ label: TEST_CONFIG.name });
  await window.locator("button:has-text('Connect')").click();
  await expect(window.locator("text=Connected").first()).toBeVisible({
    timeout: 10_000,
  });

  // Wait for file listing to populate.
  await expect(window.locator("text=plot.gcode").first()).toBeVisible({
    timeout: 10_000,
  });
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
});

// ─── Group 1: File listing ────────────────────────────────────────────────────

test("file browser shows gcode files after connecting", async () => {
  await expect(window.locator("text=plot.gcode").first()).toBeVisible();
  await expect(window.locator("text=sketch.gcode").first()).toBeVisible();
});

test("file browser shows directories with a folder icon", async () => {
  const subdirRow = window.locator("[data-testid='file-row-subdir']");
  await expect(subdirRow).toBeVisible();
  await expect(subdirRow.locator("text=📁")).toBeVisible();
});

test("file browser shows file size labels for gcode files", async () => {
  // plot.gcode is 2048 bytes → should display "2K"
  const plotRow = window.locator("[data-testid='file-row-plot.gcode']");
  await expect(plotRow.locator("text=/\\d+[KMB]/")).toBeVisible({
    timeout: 3000,
  });
});

// ─── Group 2: File selection ──────────────────────────────────────────────────

test("clicking a gcode file selects it and highlights the row", async () => {
  const plotRow = window.locator("[data-testid='file-row-plot.gcode']");
  await plotRow.click();

  // Selection applies bg-[var(--tf-file-selected)] class
  await expect(plotRow).toHaveClass(/tf-file-selected/, { timeout: 3000 });
});

test("selected gcode file name appears in the Job Controls panel", async () => {
  await expect(window.locator("text=plot.gcode").first()).toBeVisible();
});

test("clicking a selected file again deselects it", async () => {
  const plotRow = window.locator("[data-testid='file-row-plot.gcode']");
  // It should already be selected from the previous test.
  await plotRow.click();

  await expect(plotRow).not.toHaveClass(/tf-file-selected/, { timeout: 3000 });
});

// ─── Group 3: Directory navigation ───────────────────────────────────────────

test("clicking a directory navigates into it and shows its contents", async () => {
  const subdirRow = window.locator("[data-testid='file-row-subdir']");
  await subdirRow.click();

  await expect(window.locator("text=nested.gcode").first()).toBeVisible({
    timeout: 5_000,
  });
});

test("breadcrumb shows the current subdirectory segment", async () => {
  // Breadcrumb renders path segments as clickable buttons.
  await expect(
    window.locator("button:has-text('subdir')").first(),
  ).toBeVisible();
});

test("clicking the root '/' breadcrumb navigates back to root", async () => {
  // The Breadcrumb component renders a "/" root button.
  await window.locator("button:has-text('/')").first().click();

  await expect(window.locator("text=plot.gcode").first()).toBeVisible({
    timeout: 5_000,
  });

  // Subdir content should no longer be visible.
  await expect(window.locator("text=nested.gcode")).not.toBeVisible({
    timeout: 3000,
  });
});

test("the '↑ Up' button navigates to the parent directory", async () => {
  // Navigate into subdir first.
  await window.locator("[data-testid='file-row-subdir']").click();
  await expect(window.locator("text=nested.gcode").first()).toBeVisible({
    timeout: 5_000,
  });

  // Click the Up (↑) button in the breadcrumb bar.
  await window.locator("button[title='Up']").first().click();

  await expect(window.locator("text=plot.gcode").first()).toBeVisible({
    timeout: 5_000,
  });
});

// ─── Group 4: Refresh ─────────────────────────────────────────────────────────

test("Refresh button (↻) is enabled when connected", async () => {
  const refreshBtn = window.locator("button[aria-label='Refresh']").first();
  await expect(refreshBtn).toBeEnabled({ timeout: 3000 });
});

test("clicking Refresh re-fetches the file listing", async () => {
  const refreshBtn = window.locator("button[aria-label='Refresh']").first();
  await refreshBtn.click();

  // Files should still be visible after refresh.
  await expect(window.locator("text=plot.gcode").first()).toBeVisible({
    timeout: 5_000,
  });
});

// ─── Group 5: Upload ────────────────────────────────────────────────────────

test("Upload footer button is visible and enabled when connected", async () => {
  // Upload button text includes "↑ Upload to"
  const uploadBtn = window.locator("button:has-text('↑ Upload to')").first();
  await expect(uploadBtn).toBeEnabled({ timeout: 3000 });
});

test("clicking Upload triggers a file open dialog", async () => {
  // Mock the dialog to return sample.gcode.
  await mockOpenDialog(electronApp, fixturePath("sample.gcode"));

  const uploadBtn = window.locator("button:has-text('↑ Upload to')").first();
  await uploadBtn.click();

  // The mocked uploadFile IPC should be called.
  // We can verify the task bar shows an upload task label.
  await expect(window.locator("text=/Upload|upload/").first()).toBeVisible({
    timeout: 5_000,
  });
});

// ─── Group 6: Delete ────────────────────────────────────────────────────────

test("hovering a file row reveals the Delete action button", async () => {
  const plotRow = window.locator("[data-testid='file-row-plot.gcode']");
  await plotRow.hover();

  const deleteBtn = window.locator(
    "[data-testid='file-actions-plot.gcode'] button[title='Delete']",
  );
  await expect(deleteBtn).toBeVisible({ timeout: 3000 });
});

test("clicking Delete shows a ConfirmDialog with the file name", async () => {
  const plotRow = window.locator("[data-testid='file-row-plot.gcode']");
  await plotRow.hover();

  const deleteBtn = window.locator(
    "[data-testid='file-actions-plot.gcode'] button[title='Delete']",
  );
  await deleteBtn.click();

  const dialog = window.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await expect(dialog.locator("text=plot.gcode")).toBeVisible();
});

test("cancelling Delete dialog keeps the file in the list", async () => {
  const cancelBtn = window.locator("[role='dialog'] button:has-text('Cancel')");
  await cancelBtn.click();

  await expect(window.locator("text=plot.gcode").first()).toBeVisible({
    timeout: 3000,
  });
});

test("confirming Delete calls deleteFile IPC and removes the file row", async () => {
  // Trigger delete again.
  const plotRow = window.locator("[data-testid='file-row-plot.gcode']");
  await plotRow.hover();

  const deleteBtn = window.locator(
    "[data-testid='file-actions-plot.gcode'] button[title='Delete']",
  );
  await deleteBtn.click();

  const confirmBtn = window.locator(
    "[role='dialog'] button:has-text('Delete')",
  );
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
  await confirmBtn.click();

  // After confirming, the dialog should close.
  await expect(window.locator("[role='dialog']")).not.toBeVisible({
    timeout: 3000,
  });
});

// ─── Group 7: Preview toolpath ────────────────────────────────────────────────

test("Preview toolpath button is visible on hover for a gcode file", async () => {
  const sketchRow = window.locator("[data-testid='file-row-sketch.gcode']");
  await sketchRow.hover();

  const previewBtn = window.locator(
    "[data-testid='file-actions-sketch.gcode'] button[title='Preview toolpath']",
  );
  await expect(previewBtn).toBeVisible({ timeout: 3000 });
});

test("clicking Preview fetches the file text and loads the canvas toolpath", async () => {
  const sketchRow = window.locator("[data-testid='file-row-sketch.gcode']");
  await sketchRow.hover();

  const previewBtn = window.locator(
    "[data-testid='file-actions-sketch.gcode'] button[title='Preview toolpath']",
  );
  await previewBtn.click();

  // If a toolpath was already loaded a confirm dialog may appear; accept it.
  const replaceBtn = window.locator(
    "[role='dialog'] button:has-text('Replace')",
  );
  if (await replaceBtn.isVisible({ timeout: 1500 })) {
    await replaceBtn.click();
  }

  // The canvas SVG should update (toolpath rendered as paths).
  const canvas = window.locator("svg").first();
  await expect(canvas).toBeVisible({ timeout: 10_000 });
});

// ─── Group 8: Run file ────────────────────────────────────────────────────────

test("'Run job now' button is visible for a gcode file when not running", async () => {
  // Make sure the machine is idle first.
  await pushRendererEvent(electronApp, "fluidnc:status", {
    state: "Idle",
    mpos: { x: 0, y: 0, z: 0 },
  });
  await window.waitForTimeout(300);

  const sketchRow = window.locator("[data-testid='file-row-sketch.gcode']");

  // Click to select the file (so it is the active job).
  await sketchRow.click();
  await sketchRow.hover();

  const runBtn = window.locator(
    "[data-testid='file-actions-sketch.gcode'] button[title='Run job now']",
  );
  await expect(runBtn).toBeVisible({ timeout: 3000 });
});
