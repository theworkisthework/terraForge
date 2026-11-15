/**
 * E2E: split G-code uploaded into an SD card folder.
 *
 * With a connected (mocked) machine, generates one file per colour from an
 * SVG and checks where each file is uploaded: into a folder named after the
 * job by default, or the SD root when "Create folder for split files" is off.
 * The upload IPC is replaced by a recorder, so nothing touches a machine.
 */
import { test, expect } from "@playwright/test";
import { launchApp, closeApp, fixturePath, mockOpenDialog, mockIpcInvoke, pushRendererEvent } from "./helpers";
import type { ElectronApplication, Page } from "playwright";

test.describe.configure({ mode: "serial" });

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

const TEST_CONFIG = {
  id: "e2e-split",
  name: "E2E Split Upload Machine",
  connection: { type: "wifi" as const, host: "127.0.0.1", port: 80, wsPort: 81 },
  bedWidth: 300,
  bedHeight: 300,
  penUpCommand: "M3S0",
  penDownCommand: "M3S1",
  penDownDelayMs: 50,
  penUpDelayMs: 0,
  penType: "solenoid-hardware" as const,
  maxSpeed: 3000,
  travelSpeed: 3000,
};

const FOLDER_OPTION = "Create folder for split files";

/** The remote paths `fluidnc:uploadGcode` has been called with, in order. */
async function uploadedPaths(): Promise<string[]> {
  return electronApp.evaluate(() => ((globalThis as { __uploads?: string[] }).__uploads ?? []).slice());
}

async function clearUploads(): Promise<void> {
  await electronApp.evaluate(() => {
    (globalThis as { __uploads?: string[] }).__uploads = [];
  });
}

/** Opens the generate dialog on its Output tab. */
async function openOutputTab(): Promise<void> {
  await window.locator("button:has-text('Generate G-code')").click();
  await expect(window.locator("h2:has-text('Generate G-code')")).toBeVisible({ timeout: 5_000 });
  await window.getByRole("tab", { name: /^output$/i }).click();
}

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());

  await mockIpcInvoke(electronApp, "config:getMachineConfigs", [TEST_CONFIG]);
  await mockIpcInvoke(electronApp, "fluidnc:connectWebSocket", undefined);
  await electronApp.evaluate(({ ipcMain }) => {
    (globalThis as { __uploads?: string[] }).__uploads = [];
    ipcMain.removeHandler("fluidnc:uploadGcode");
    ipcMain.handle("fluidnc:uploadGcode", async (_e: Electron.IpcMainInvokeEvent, _taskId: string, _gcode: string, remotePath: string) => {
      (globalThis as { __uploads?: string[] }).__uploads!.push(remotePath);
    });
    ipcMain.removeHandler("fluidnc:listSDFiles");
    ipcMain.handle("fluidnc:listSDFiles", async () => []);
    ipcMain.removeHandler("fluidnc:listFiles");
    ipcMain.handle("fluidnc:listFiles", async () => []);
  });

  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await window.locator("select[aria-label='Machine selector']").first().waitFor({ timeout: 15_000 });
  await window.locator("select[aria-label='Machine selector']").selectOption({ label: TEST_CONFIG.name });
  await window.locator("button:has-text('Connect')").click();
  // The mocked connect only resolves; simulate the liveness ping the real client sends.
  await pushRendererEvent(electronApp, "fluidnc:ping", undefined);
  await expect(window.locator("text=Connected").first()).toBeVisible({ timeout: 10_000 });

  await mockOpenDialog(electronApp, fixturePath("sample.svg"));
  await window.locator("button:has-text('Import')").click();
  await expect(window.locator("text=sample").first()).toBeVisible({ timeout: 10_000 });
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
});

test("the folder option is on, but disabled until output is split", async () => {
  await openOutputTab();
  const folder = window.getByRole("checkbox", { name: FOLDER_OPTION });
  await expect(folder).toBeChecked();
  await expect(folder).toBeDisabled();

  await window.getByRole("checkbox", { name: "Split output into separate files" }).check();
  await expect(folder).toBeEnabled();

  await window.getByRole("checkbox", { name: "Upload to SD card" }).uncheck();
  await expect(folder).toBeDisabled();
  await window.getByRole("checkbox", { name: "Upload to SD card" }).check();
  await expect(folder).toBeEnabled();

  await window.locator("button:has-text('Cancel')").click();
});

test("split files are uploaded into a folder named after the job", async () => {
  await clearUploads();
  await openOutputTab();
  await window.getByRole("checkbox", { name: "Split output into separate files" }).check();
  await window.getByRole("radio", { name: "Export one file per colour group" }).check();
  await expect(window.getByRole("checkbox", { name: FOLDER_OPTION })).toBeChecked();
  await window.locator("button").filter({ hasText: /^Generate$/ }).click();

  await expect.poll(async () => (await uploadedPaths()).length, { timeout: 30_000 }).toBeGreaterThan(1);
  const paths = await uploadedPaths();
  for (const p of paths) expect(p).toMatch(/^\/sample\/[^/]+\.gcode$/);
});

test("with the folder option off, split files go to the SD root", async () => {
  await expect(window.locator("button:has-text('Generate G-code')")).toHaveText("Generate G-code", { timeout: 30_000 });
  await clearUploads();
  await openOutputTab();
  await window.getByRole("checkbox", { name: FOLDER_OPTION }).uncheck();
  await window.locator("button").filter({ hasText: /^Generate$/ }).click();

  await expect.poll(async () => (await uploadedPaths()).length, { timeout: 30_000 }).toBeGreaterThan(1);
  for (const p of await uploadedPaths()) expect(p).toMatch(/^\/[^/]+\.gcode$/);
});
