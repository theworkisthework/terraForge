/**
 * E2E: creating and deleting folders on the SD card from the file browser.
 *
 * The SD card is a small in-memory tree in the main process: the listing,
 * create-folder and delete-folder IPC handlers read and change it, so what
 * the pane shows after each step is what the app asked for. A folder named
 * "locked" is refused, to see the machine's error reach the dialog through
 * real IPC (Electron wraps it, and the dialog should not show the wrapper).
 */
import { test, expect } from "@playwright/test";
import { launchApp, closeApp, mockIpcInvoke, pushRendererEvent } from "./helpers";
import type { ElectronApplication, Page } from "playwright";

test.describe.configure({ mode: "serial" });

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

const TEST_CONFIG = {
  id: "e2e-sd-folders",
  name: "E2E SD Folders Machine",
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

type Entry = { name: string; path: string; size: number; isDirectory: boolean };
type FakeSd = { tree: Record<string, Entry[]>; calls: string[] };

/** The folder operations the app has asked the machine for, in order. */
async function folderCalls(): Promise<string[]> {
  return electronApp.evaluate(() => (globalThis as unknown as { __sd: FakeSd }).__sd.calls.slice());
}

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());

  await mockIpcInvoke(electronApp, "config:getMachineConfigs", [TEST_CONFIG]);
  await mockIpcInvoke(electronApp, "fluidnc:connectWebSocket", undefined);
  await electronApp.evaluate(({ ipcMain }) => {
    const sd: FakeSd = {
      tree: {
        "/": [
          { name: "jobs", path: "/jobs", size: 0, isDirectory: true },
          { name: "plot.gcode", path: "/plot.gcode", size: 2048, isDirectory: false },
        ],
        "/jobs": [],
      },
      calls: [],
    };
    (globalThis as unknown as { __sd: FakeSd }).__sd = sd;
    const split = (path: string) => {
      const parts = path.split("/").filter(Boolean);
      const name = parts.pop()!;
      return { parent: "/" + parts.join("/"), name };
    };

    ipcMain.removeHandler("fluidnc:listSDFiles");
    ipcMain.handle("fluidnc:listSDFiles", async (_e: Electron.IpcMainInvokeEvent, path: string) =>
      (sd.tree[path] ?? []).slice(),
    );
    ipcMain.removeHandler("fluidnc:listFiles");
    ipcMain.handle("fluidnc:listFiles", async () => []);

    ipcMain.removeHandler("fluidnc:createSdFolder");
    ipcMain.handle("fluidnc:createSdFolder", async (_e: Electron.IpcMainInvokeEvent, path: string) => {
      sd.calls.push(`create ${path}`);
      const { parent, name } = split(path);
      if (name === "locked") throw new Error(`The machine did not create the folder "${name}"`);
      sd.tree[parent].push({ name, path, size: 0, isDirectory: true });
      sd.tree[path] = [];
    });

    ipcMain.removeHandler("fluidnc:deleteSdFolder");
    ipcMain.handle("fluidnc:deleteSdFolder", async (_e: Electron.IpcMainInvokeEvent, path: string) => {
      sd.calls.push(`delete ${path}`);
      const { parent } = split(path);
      sd.tree[parent] = sd.tree[parent].filter((entry) => entry.path !== path);
      delete sd.tree[path];
    });
  });

  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await window.locator("select[aria-label='Machine selector']").first().waitFor({ timeout: 15_000 });
  await window.locator("select[aria-label='Machine selector']").selectOption({ label: TEST_CONFIG.name });
  await window.locator("button:has-text('Connect')").click();
  // The mocked connect only resolves; simulate the liveness ping the real client sends.
  await pushRendererEvent(electronApp, "fluidnc:ping", undefined);
  await expect(window.locator("text=Connected").first()).toBeVisible({ timeout: 10_000 });
  await expect(window.locator("[data-testid='file-row-jobs']")).toBeVisible({ timeout: 10_000 });
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
});

test("a new folder made at the root appears in the listing", async () => {
  await window.getByRole("button", { name: "New folder" }).click();
  const dialog = window.getByRole("dialog");
  await expect(dialog.getByText("Create a folder in /")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Folder name" }).fill("plots");
  await dialog.getByRole("textbox", { name: "Folder name" }).press("Enter");

  await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  await expect(window.locator("[data-testid='file-row-plots']")).toBeVisible({ timeout: 5_000 });
  expect(await folderCalls()).toEqual(["create /plots"]);
});

test("a name already used is refused before the machine is asked", async () => {
  await window.getByRole("button", { name: "New folder" }).click();
  const dialog = window.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Folder name" }).fill("JOBS");
  await expect(dialog.getByRole("alert")).toHaveText('"JOBS" already exists here');
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
  expect(await folderCalls()).toEqual(["create /plots"]);
});

test("a folder made inside another goes there", async () => {
  await window.locator("[data-testid='file-row-jobs']").click();
  await expect(window.locator("text=Empty.").last()).toBeVisible({ timeout: 5_000 });

  await window.getByRole("button", { name: "New folder" }).click();
  const dialog = window.getByRole("dialog");
  await expect(dialog.getByText("Create a folder in /jobs")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Folder name" }).fill("drafts");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(window.locator("[data-testid='file-row-drafts']")).toBeVisible({ timeout: 5_000 });
  expect((await folderCalls()).at(-1)).toBe("create /jobs/drafts");
});

test("the machine's refusal is shown in the dialog without Electron's wrapper", async () => {
  await window.getByRole("button", { name: "New folder" }).click();
  const dialog = window.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Folder name" }).fill("locked");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(dialog.getByRole("alert")).toHaveText('The machine did not create the folder "locked"', {
    timeout: 5_000,
  });
  await expect(dialog).toBeVisible();
  await dialog.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(window.locator("[data-testid='file-row-locked']")).toHaveCount(0);
});

test("deleting a folder asks first, then removes it and says so", async () => {
  await window.getByRole("button", { name: "Root folder" }).click();
  const row = window.locator("[data-testid='file-row-jobs']");
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.hover();
  await row.getByRole("button", { name: "Delete folder" }).click();

  const dialog = window.getByRole("dialog");
  await expect(dialog.getByText('Delete the folder "jobs" and everything in it?', { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  await expect(row).toHaveCount(0, { timeout: 5_000 });
  await expect(window.locator("text=Deleted folder jobs").first()).toBeVisible({ timeout: 5_000 });
  expect((await folderCalls()).at(-1)).toBe("delete /jobs");
  await expect(window.locator("[data-testid='file-row-plot.gcode']")).toBeVisible();
});

test("cancelling a folder delete keeps the folder", async () => {
  const row = window.locator("[data-testid='file-row-plots']");
  await row.hover();
  await row.getByRole("button", { name: "Delete folder" }).click();
  await window.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  await expect(window.getByRole("dialog")).not.toBeVisible();
  await expect(row).toBeVisible();
  expect((await folderCalls()).filter((call) => call.startsWith("delete"))).toEqual(["delete /jobs"]);
});
