/**
 * E2E: Jog controls — button visibility and command dispatch.
 *
 * The JogControls panel is shown by default (showJog starts true in App.tsx).
 * Tests verify that each directional button, pen command, positioning shortcut,
 * step-size selector, and feedrate input emit the expected G-code string via
 * the fluidnc:sendCommand IPC channel.
 *
 * Strategy: override the fluidnc:sendCommand handler in the Electron main
 * process to push received commands into a global `__jogCmds` array so each
 * test can read and assert the emitted sequence without real hardware.
 *
 * The machine config is mocked so that `activeConfig` in JogControls returns
 * a solenoid machine with penUpCommand "M3 S0" and penDownCommand "M3 S1",
 * which is required for pen-up / pen-down assertions.
 */
import { test, expect } from "@playwright/test";
import {
  launchApp,
  closeApp,
  mockIpcInvoke,
  pushRendererEvent,
} from "./helpers";
import type { ElectronApplication, Page } from "playwright";

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

const TEST_CONFIG = {
  id: "e2e-jog",
  name: "E2E Jog Machine",
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
  penUpDelayMs: 0,
  penType: "solenoid" as const,
  maxSpeed: 3000,
  travelSpeed: 3000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Install the tracking sendCommand handler in the main process. */
async function installCommandTracker(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    (global as any).__jogCmds = [];
    ipcMain.removeHandler("fluidnc:sendCommand");
    ipcMain.handle(
      "fluidnc:sendCommand",
      (_e: Electron.IpcMainInvokeEvent, cmd: string) => {
        (global as any).__jogCmds.push(cmd);
      },
    );
  });
}

async function getTrackedCommands(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (global as any).__jogCmds as string[]);
}

async function clearTrackedCommands(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    (global as any).__jogCmds = [];
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());

  // Provide the test machine config so the toolbar dropdown + activeConfig work.
  await mockIpcInvoke(electronApp, "config:getMachineConfigs", [TEST_CONFIG]);
  await mockIpcInvoke(electronApp, "fluidnc:connectWebSocket", undefined);

  // Reload so the app picks up the mocked configs.
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await window
    .locator("select[aria-label='Machine selector']")
    .first()
    .waitFor({ timeout: 15_000 });

  // Select and connect so activeConfig is populated.
  await window
    .locator("select[aria-label='Machine selector']")
    .selectOption({ label: TEST_CONFIG.name });
  await window.locator("button:has-text('Connect')").click();
  await expect(window.locator("text=Connected").first()).toBeVisible({
    timeout: 10_000,
  });

  // Install the command tracker on top of the real handler.
  await installCommandTracker(electronApp);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
});

test.beforeEach(async () => {
  // Fresh command log before each test.
  await clearTrackedCommands(electronApp);
});

// ─── Panel visibility ─────────────────────────────────────────────────────────

test("Jog Controls panel is visible by default", async () => {
  await expect(window.locator("text=Jog Controls")).toBeVisible();
});

test("step size buttons 0.1 / 1 / 10 / 100 are all visible", async () => {
  // Use exact-text filter: has-text is a substring match so '1' would also match '0.1', '10', '100'.
  await expect(
    window
      .locator("button")
      .filter({ hasText: /^0\.1$/ })
      .first(),
  ).toBeVisible();
  await expect(
    window.locator("button").filter({ hasText: /^1$/ }).first(),
  ).toBeVisible();
  await expect(
    window.locator("button").filter({ hasText: /^10$/ }).first(),
  ).toBeVisible();
  await expect(
    window.locator("button").filter({ hasText: /^100$/ }).first(),
  ).toBeVisible();
});

// ─── Step selector ────────────────────────────────────────────────────────────

test("clicking step '10' makes it the active step", async () => {
  const btn = window.locator("button").filter({ hasText: /^10$/ }).first();
  await btn.click();
  // Active step gets bg-accent class (see JogControls.tsx step selector)
  await expect(btn).toHaveClass(/bg-accent/, { timeout: 2000 });
});

test("clicking step '1' restores it as the active step", async () => {
  const btn10 = window.locator("button").filter({ hasText: /^10$/ }).first();
  const btn1 = window.locator("button").filter({ hasText: /^1$/ }).first();
  // Make sure step=10 is selected first
  await btn10.click();
  await expect(btn10).toHaveClass(/bg-accent/, { timeout: 2000 });

  // Switch back to 1
  await btn1.click();
  await expect(btn1).toHaveClass(/bg-accent/, { timeout: 2000 });
  await expect(btn10).not.toHaveClass(/bg-accent/, { timeout: 2000 });
});

// ─── Directional jog (step = 1, feedrate = 3000) ─────────────────────────────
// Step=1 is active after the previous tests reset it.

test("Jog Y+ sends '$J=G91 G21 Y1.000 F3000'", async () => {
  // Ensure step=1 — use exact match so '1' doesn't match '0.1', '10', '100'
  await window.locator("button").filter({ hasText: /^1$/ }).first().click();

  await window.locator('[aria-label="Jog Y+"]').click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("$J=G91 G21 Y1.000 F3000");
});

test("Jog Y- sends '$J=G91 G21 Y-1.000 F3000'", async () => {
  await window.locator('[aria-label="Jog Y-"]').click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("$J=G91 G21 Y-1.000 F3000");
});

test("Jog X+ sends '$J=G91 G21 X1.000 F3000'", async () => {
  await window.locator('[aria-label="Jog X+"]').click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("$J=G91 G21 X1.000 F3000");
});

test("Jog X- sends '$J=G91 G21 X-1.000 F3000'", async () => {
  await window.locator('[aria-label="Jog X-"]').click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("$J=G91 G21 X-1.000 F3000");
});

// ─── Step size affects jog distance ──────────────────────────────────────────

test("step '10' changes jog distance: X+ sends X10.000", async () => {
  await window.locator("button").filter({ hasText: /^10$/ }).first().click();
  await clearTrackedCommands(electronApp);

  await window.locator('[aria-label="Jog X+"]').click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds.some((c) => c.includes("X10.000"))).toBe(true);
});

test("step '0.1' changes jog distance: Y- sends Y-0.100", async () => {
  await window
    .locator("button")
    .filter({ hasText: /^0\.1$/ })
    .first()
    .click();
  await clearTrackedCommands(electronApp);

  await window.locator('[aria-label="Jog Y-"]').click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds.some((c) => c.includes("Y-0.100"))).toBe(true);

  // Restore step=1 for subsequent tests
  await window.locator("button").filter({ hasText: /^1$/ }).first().click();
});

// ─── Feedrate input ───────────────────────────────────────────────────────────

test("changing feedrate to 1500 is used in the next jog command", async () => {
  const feedrateInput = window.locator("input[type='number']").last(); // Feedrate is the last number input in JogControls
  await feedrateInput.click({ clickCount: 3 });
  await feedrateInput.fill("1500");
  await feedrateInput.press("Tab");

  await clearTrackedCommands(electronApp);
  await window.locator('[aria-label="Jog Y+"]').click();

  const cmds = await getTrackedCommands(electronApp);
  expect(cmds.some((c) => c.includes("F1500"))).toBe(true);

  // Restore feedrate for subsequent tests
  await feedrateInput.click({ clickCount: 3 });
  await feedrateInput.fill("3000");
  await feedrateInput.press("Tab");
});

// ─── Positioning shortcuts ────────────────────────────────────────────────────

test("'Go to origin' button sends 'G0 X0 Y0'", async () => {
  await window.locator('[aria-label="Go to origin"]').click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("G0 X0 Y0");
});

test("'Run Homing' button sends '$H'", async () => {
  await window.locator("button:has-text('Run Homing')").click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("$H");
});

test("'Set Zero' button sends 'G10 L20 P1 X0 Y0'", async () => {
  await window.locator("button:has-text('Set Zero')").click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("G10 L20 P1 X0 Y0");
});

// ─── Pen commands (solenoid) ──────────────────────────────────────────────────

test("Pen down button sends the configured penDownCommand (M3 S1)", async () => {
  const btn = window.locator('[aria-label="Pen down"]');
  await expect(btn).toBeEnabled({ timeout: 3000 }); // enabled when penDown is configured
  await btn.click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("M3 S1");
});

test("Pen up button sends the configured penUpCommand (M3 S0)", async () => {
  const btn = window.locator('[aria-label="Pen up"]');
  await expect(btn).toBeEnabled({ timeout: 3000 });
  await btn.click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("M3 S0");
});

test("'Zero Z' button sends 'G10 L20 P1 Z0'", async () => {
  await window.locator('[aria-label="Zero Z"]').click();
  const cmds = await getTrackedCommands(electronApp);
  expect(cmds).toContain("G10 L20 P1 Z0");
});

// ─── Close button ─────────────────────────────────────────────────────────────

test("closing Jog Controls via ✕ hides the panel", async () => {
  // The close button has a small ✕ inside the panel header.
  await window
    .locator("div:has(> span:text('Jog Controls')) button:has-text('✕')")
    .click();
  await expect(window.locator("text=Jog Controls")).not.toBeVisible({
    timeout: 3000,
  });
});

test("clicking the 'Jog' toolbar button shows the panel again", async () => {
  await window.locator("button:has-text('Jog')").click();
  await expect(window.locator("text=Jog Controls")).toBeVisible({
    timeout: 3000,
  });
});
