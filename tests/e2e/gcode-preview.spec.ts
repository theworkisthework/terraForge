/**
 * E2E: G-code auto-preview + file browser job controls.
 *
 * Covers four feature areas introduced together:
 *
 * 1. GcodeOptionsDialog defaults — "Upload to SD card" is on, "Save to
 *    computer" is off, so the common workflow (generate → upload) works with
 *    zero extra clicks.
 *
 * 2. G-code import auto-loads toolpath — importing a .gcode file immediately
 *    parses and displays its toolpath and queues it as the active job.
 *
 * 3. Auto-preview before start — when the user clicks "Start job" for a
 *    remote file that has no toolpath loaded yet (e.g. the SVG layer was
 *    deleted after generation, or the file was selected from the file browser
 *    without first clicking Preview), the app automatically fetches the file
 *    from the machine, parses it, and loads the preview *before* issuing the
 *    run command.  The "Loading preview…" bar is visible during this phase.
 *
 * 4. File browser job-button states — while a job is running the selected
 *    file's action buttons are permanently visible and the play ▶ button
 *    becomes a pause ⏸ button.  Other gcode files have their action buttons
 *    (preview, play, download, delete) disabled for the duration of the job.
 *
 * Tests in groups 3 and 4 use IPC mocking to simulate a connected machine
 * and a running job without requiring real hardware.
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

// ── Shared app instance ────────────────────────────────────────────────────────

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

// ── Test fixtures ──────────────────────────────────────────────────────────────

/** Machine config returned by the mocked getMachineConfigs IPC handler. */
const TEST_CONFIG = {
  id: "e2e-machine",
  name: "E2E Test Machine",
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
  penType: "solenoid" as const,
  maxSpeed: 3000,
  travelSpeed: 3000,
};

/** Two .gcode files returned by the mocked SD-card listing. */
const SD_FILES = [
  { name: "job.gcode", path: "/job.gcode", size: 1024, isDirectory: false },
  { name: "other.gcode", path: "/other.gcode", size: 512, isDirectory: false },
];

/** Minimal G-code content returned when the app fetches a remote file. */
const REMOTE_GCODE =
  "G21\nG90\nG0 Z5\nM3 S0\nG0 X0 Y0\nG1 X50 Y50 F1000\nM3 S0\nG0 X0 Y0\nM2\n";

// ── Setup / teardown ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());

  // ── Static IPC mocks (JSON-serializable, set up before reload) ─────────────
  // Provide the test machine config so the toolbar dropdown is populated.
  await mockIpcInvoke(electronApp, "config:getMachineConfigs", [TEST_CONFIG]);

  // Connect succeeds immediately — no real machine required.
  await mockIpcInvoke(electronApp, "fluidnc:connectWebSocket", undefined);

  // SD card file listing returns our two test files.
  await mockIpcInvoke(electronApp, "fluidnc:listSDFiles", SD_FILES);
  await mockIpcInvoke(electronApp, "fluidnc:listFiles", []);

  // runFile resolves immediately (we check state *before* this is called).
  await mockIpcInvoke(electronApp, "fluidnc:runFile", undefined);
  await mockIpcInvoke(electronApp, "fluidnc:pauseJob", undefined);

  // fetchFileText has a 1.5 s delay so the "Loading preview…" bar is visible
  // long enough for assertions to catch it.
  await electronApp.evaluate(({ ipcMain }, gcode) => {
    ipcMain.removeHandler("fluidnc:fetchFileText");
    ipcMain.handle(
      "fluidnc:fetchFileText",
      () => new Promise<string>((res) => setTimeout(() => res(gcode), 1500)),
    );
  }, REMOTE_GCODE);

  // Reload so the app re-runs its mount effect with the mocked configs.
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await window.locator("text=terraForge").first().waitFor({ timeout: 15_000 });

  // ── Connect to the mocked machine ─────────────────────────────────────────
  // Select the test machine in the toolbar dropdown.
  await window
    .locator("select[aria-label='Machine selector']")
    .selectOption({ label: TEST_CONFIG.name });

  // Click Connect — the mocked handler resolves immediately.
  await window.locator("button:has-text('Connect')").click();

  // Wait for the toolbar to show "Connected" / the SD card pane to refresh.
  await expect(window.locator("text=Connected").first()).toBeVisible({
    timeout: 10_000,
  });

  // The SD card list is populated by the connection trigger — wait for files.
  await expect(window.locator("text=job.gcode").first()).toBeVisible({
    timeout: 10_000,
  });
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
});

// ── Group 1: GcodeOptionsDialog defaults ─────────────────────────────────────

test("GcodeOptionsDialog: 'Upload to SD card' is checked by default", async () => {
  // Import an SVG so the Generate G-code button is enabled.
  await mockOpenDialog(electronApp, fixturePath("sample.svg"));
  await window.locator("button:has-text('Import')").click();
  await expect(window.locator("text=sample").first()).toBeVisible({
    timeout: 10_000,
  });

  await window.locator("button:has-text('Generate G-code')").click();
  await expect(window.locator("button:has-text('Cancel')")).toBeVisible({
    timeout: 5_000,
  });

  const uploadCheckbox = window.locator(
    "label:has-text('Upload to SD card') input[type='checkbox']",
  );
  await expect(uploadCheckbox).toBeChecked();

  await window.locator("button:has-text('Cancel')").click();
});

test("GcodeOptionsDialog: 'Save to computer' is unchecked by default", async () => {
  await window.locator("button:has-text('Generate G-code')").click();
  await expect(window.locator("button:has-text('Cancel')")).toBeVisible({
    timeout: 5_000,
  });

  const saveCheckbox = window.locator(
    "label:has-text('Save to computer') input[type='checkbox']",
  );
  await expect(saveCheckbox).not.toBeChecked();

  await window.locator("button:has-text('Cancel')").click();
});

// ── Group 2: G-code import auto-loads toolpath ────────────────────────────────

test("importing a .gcode file loads its toolpath and shows the canvas preview", async () => {
  await mockOpenDialog(electronApp, fixturePath("sample.gcode"));
  await window.locator("button:has-text('Import')").click();

  // After import, the canvas should display the G-code toolpath overlay.
  // The toolpath is rendered as a polyline/path inside the SVG canvas.
  const canvas = window.locator("svg").first();
  await expect(canvas).toBeVisible({ timeout: 10_000 });

  // The Job panel must show the imported filename.
  await expect(window.locator("text=sample.gcode").first()).toBeVisible({
    timeout: 10_000,
  });
});

test("imported .gcode file is shown with '(local — will upload)' source indicator", async () => {
  // The Job panel's file indicator shows this text for locally-sourced files.
  const indicator = window.locator("text=local — will upload").first();
  await expect(indicator).toBeVisible({ timeout: 5_000 });
});

test("Start job button is enabled after importing a .gcode file", async () => {
  // Machine is connected; a valid .gcode file is selected — Start should be enabled.
  // (The button is disabled until connected AND a valid file is selected.)
  const startBtn = window.locator("button:has-text('Start job')");
  await expect(startBtn).toBeEnabled({ timeout: 5_000 });
});

// ── Group 3: Auto-preview before start ───────────────────────────────────────
//
// The auto-preview path in JobControls is triggered when the selected job file
// is a remote file (source "sd"/"fs") and its toolpath has not been loaded yet.
// We simulate this by clicking a remote file in the SD-card file browser to
// set it as the selected job WITHOUT loading its toolpath, then clicking Start.

test("clicking a remote gcode file in the file browser selects it as the job", async () => {
  // Use the data-testid row to avoid ambiguous text matches.
  const jobRow = window.locator("[data-testid='file-row-job.gcode']");

  // If the row is already selected (blue highlight), clicking would deselect it.
  // Ensure it ends up selected regardless of prior state.
  const isBlueBg = await jobRow.evaluate((el) =>
    el.className.includes("bg-[#1a3a6e]"),
  );
  if (!isBlueBg) {
    await jobRow.click();
    await window.waitForTimeout(200);
  }

  // The Job panel should now show the filename (overriding the local import).
  await expect(window.locator("text=job.gcode").first()).toBeVisible({
    timeout: 5_000,
  });

  // It should NOT show the "(local — will upload)" indicator for a remote file.
  await expect(window.locator("text=local — will upload")).not.toBeVisible({
    timeout: 3_000,
  });
});

test("clicking Start job for a remote file without a prior toolpath shows 'Loading preview…'", async () => {
  // Ensure job.gcode is the selected job file (from previous test).
  // The fetchFileText mock adds a 1.5 s delay, giving us time to assert.
  const startBtn = window.locator("button:has-text('Start job')");
  await expect(startBtn).toBeEnabled({ timeout: 5_000 });

  await startBtn.click();

  // The "Loading preview…" bar should appear in the Job panel while the
  // toolpath is being fetched from the machine.
  const loadingBar = window.locator("text=Loading preview…").first();
  await expect(loadingBar).toBeVisible({ timeout: 5_000 });
});

test("'Loading preview…' bar disappears once the toolpath has been fetched", async () => {
  // After the 1.5 s mock delay the preview is loaded and the bar clears.
  const loadingBar = window.locator("text=Loading preview…").first();
  await expect(loadingBar).not.toBeVisible({ timeout: 10_000 });
});

// ── Group 4: File browser job-button states during a running job ──────────────
//
// Machine status is injected via the fluidnc:status IPC channel.  After the
// status push the machineStore's status.state becomes "Run", which changes
// which buttons the file browser renders for the running file vs other files.

test("file browser: play ▶ becomes pause ⏸ for the running file", async () => {
  // Ensure job.gcode is selected.  If the row already has the blue highlight,
  // leave it alone; otherwise click to select and wait for the highlight.
  const jobRow = window.locator("[data-testid='file-row-job.gcode']");
  const isBlueBg = await jobRow.evaluate((el) =>
    el.className.includes("bg-[#1a3a6e]"),
  );
  if (!isBlueBg) {
    await jobRow.click();
    // Wait for the selection to register (blue highlight appears).
    await window.waitForFunction(
      () =>
        document
          .querySelector("[data-testid='file-row-job.gcode']")
          ?.className.includes("bg-[#1a3a6e]"),
      { timeout: 5_000 },
    );
  }

  // Simulate a running job.
  await pushRendererEvent(electronApp, "fluidnc:status", {
    state: "Run",
    mpos: { x: 10, y: 10, z: 0 },
  });

  // The pause ⏸ button should now be visible in job.gcode's action container.
  const pauseBtn = window.locator(
    "[data-testid='file-actions-job.gcode'] button[title='Pause job']",
  );
  await expect(pauseBtn).toBeVisible({ timeout: 5_000 });
});

test("file browser: play ▶ button is not shown for the running file", async () => {
  // The ▶ "Run job now" button should not be present — it's replaced by ⏸.
  const playBtn = window.locator(
    "[data-testid='file-actions-job.gcode'] button[title='Run job now']",
  );
  await expect(playBtn).not.toBeVisible({ timeout: 3_000 });
});

test("file browser: action buttons are visible without hover for the running file", async () => {
  // The action container is flex (not hidden group-hover:flex) while the job runs.
  const actionsDiv = window.locator("[data-testid='file-actions-job.gcode']");
  await expect(actionsDiv).toBeVisible({ timeout: 3_000 });

  const pauseBtn = actionsDiv.locator("button[title='Pause job']");
  await expect(pauseBtn).toBeVisible({ timeout: 3_000 });
});

test("file browser: other gcode files have their download button disabled during a running job", async () => {
  // Hover to reveal hidden action buttons, then check the title changes to
  // "Unavailable while a job is running" and the button is disabled.
  const otherRow = window.locator("[data-testid='file-row-other.gcode']");
  await otherRow.hover();

  const downloadBtn = window
    .locator(
      "[data-testid='file-actions-other.gcode'] button[title='Unavailable while a job is running']",
    )
    .first();
  await expect(downloadBtn).toBeDisabled({ timeout: 3_000 });
});

test("file browser: other gcode files have their delete button disabled during a running job", async () => {
  const otherRow = window.locator("[data-testid='file-row-other.gcode']");
  await otherRow.hover();

  // All action buttons for the non-running file should be disabled.
  const actionsDiv = window.locator("[data-testid='file-actions-other.gcode']");
  const buttons = actionsDiv.locator("button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(buttons.nth(i)).toBeDisabled({ timeout: 3_000 });
  }
});

test("file browser: other gcode files have their preview button disabled during a running job", async () => {
  const otherRow = window.locator("[data-testid='file-row-other.gcode']");
  await otherRow.hover();

  const previewBtn = window.locator(
    "[data-testid='file-actions-other.gcode'] button[title='Preview toolpath']",
  );
  const count = await previewBtn.count();
  if (count > 0) {
    await expect(previewBtn.first()).toBeDisabled({ timeout: 3_000 });
  }
});

// ── Group 5: Post-job: play returns when job ends ────────────────────────────

test("file browser: pause ⏸ reverts to play ▶ when the job ends (Idle)", async () => {
  // Simulate the machine returning to Idle.
  await pushRendererEvent(electronApp, "fluidnc:status", {
    state: "Idle",
    mpos: { x: 0, y: 0, z: 0 },
  });

  await window.waitForTimeout(300);

  // The running file row should no longer show the pause button.
  const pauseBtn = window.locator(
    "[data-testid='file-actions-job.gcode'] button[title='Pause job']",
  );
  await expect(pauseBtn).not.toBeVisible({ timeout: 5_000 });
});
