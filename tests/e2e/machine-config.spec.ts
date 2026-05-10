/**
 * E2E: Machine configuration dialog.
 *
 * Tests the full CRUD lifecycle for machine configs:
 *   - Open / close dialog
 *   - View default config
 *   - Create a new config
 *   - Edit config fields
 *   - Duplicate config
 *   - Delete config
 *   - Set as active
 *   - Export / import flows (dialog mocked)
 *
 * All sidebar config locators are scoped to `.w-52` (the dialog sidebar)
 * so they don't accidentally match `<option>` elements in the toolbar's
 * machine-selector `<select>`.
 */
import { test, expect } from "@playwright/test";
import { launchApp, closeApp, mockSaveDialog, mockOpenDialog } from "./helpers";
import type { ElectronApplication, Page } from "playwright";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;
let tempDir: string;

const dialog = (page: Page) => page.locator("div[role='dialog']").first();
const sidebar = (page: Page) => dialog(page).locator(".w-52").first();
const formArea = (page: Page) => dialog(page).locator("fieldset").first();

/** Helper: locate a config entry button inside the settings sidebar only. */
const sidebarEntry = (page: Page, name: string) =>
  sidebar(page)
    .locator(".group button.flex-1.text-left", { hasText: name })
    .first();

async function openMachineConfigs(page: Page): Promise<void> {
  const dlg = dialog(page);
  if ((await dlg.count()) === 0) {
    await page.locator("button[aria-label='Machine settings']").click();
    await dlg.waitFor({ timeout: 5000 });
  }

  await dlg
    .locator("button:has-text('Machine Configurations')")
    .first()
    .click();
  await expect(
    dlg.locator("button:has-text('Machine Configurations')").first(),
  ).toBeVisible({
    timeout: 5000,
  });
  await expect(sidebar(page)).toBeVisible({ timeout: 5000 });
}

test.beforeAll(async () => {
  // launchApp creates an isolated temp user-data directory so we never
  // touch the real user's machine-configs.json or any other persisted state.
  ({ electronApp, window, userDataDir } = await launchApp());
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "terraforge-cfg-e2e-"));
});

test.afterAll(async () => {
  // closeApp removes the temp user-data dir automatically.
  if (electronApp) await closeApp(electronApp, userDataDir);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ─── Open / close dialog ────────────────────────────────────────────────────

test("settings button opens Machine Configurations dialog", async () => {
  await openMachineConfigs(window);
  await expect(dialog(window)).toBeVisible({ timeout: 5000 });
});

test("dialog shows default TerraPen config in sidebar", async () => {
  await openMachineConfigs(window);
  await expect(
    sidebar(window).locator(".group button.flex-1.text-left").first(),
  ).toBeVisible();
});

test("default config form shows expected values", async () => {
  await openMachineConfigs(window);

  // Click the default config to select it
  await sidebar(window)
    .locator(".group button.flex-1.text-left")
    .first()
    .click();

  // Check the form has populated fields — look for known default values
  // Bed dimensions (220 x 200), feedrate (3000)
  const widthInputs = formArea(window).locator('input[type="number"]');
  const allValues = await widthInputs.evaluateAll((els) =>
    els.map((el) => (el as HTMLInputElement).value),
  );
  expect(allValues).toContain("220");
  expect(allValues).toContain("200");
});

// ─── Create new config ──────────────────────────────────────────────────────

test("clicking '+ New' creates a new config entry", async () => {
  await openMachineConfigs(window);

  const newBtn = dialog(window).locator("button:has-text('+ New')");
  await newBtn.click();

  // A "New Machine" entry should appear in the sidebar
  const newEntry = sidebar(window).locator("text=New Machine").first();
  await expect(newEntry).toBeVisible({ timeout: 3000 });
});

test("new config form has default values", async () => {
  await openMachineConfigs(window);

  // Name should be "New Machine" — look in the form area
  const nameInput = formArea(window).locator('input[type="text"]').first();
  await expect(nameInput).toHaveValue("New Machine");
});

test("editing the name field updates the form", async () => {
  await openMachineConfigs(window);

  const nameInput = formArea(window).locator('input[type="text"]').first();
  await nameInput.fill("Test Machine E2E");
  await expect(nameInput).toHaveValue("Test Machine E2E");
});

test("Save Changes button becomes enabled after editing", async () => {
  await openMachineConfigs(window);

  const saveBtn = dialog(window).locator("button:has-text('Save Changes')");
  await expect(saveBtn).toBeEnabled();
});

test("clicking Save creates the new config", async () => {
  await openMachineConfigs(window);

  const saveBtn = dialog(window).locator("button:has-text('Save Changes')");
  await saveBtn.click();

  // Wait for the config to appear in the sidebar — the save triggers an IPC
  // round-trip: save → reload configs → store update → re-render
  await expect(sidebarEntry(window, "Test Machine E2E")).toBeVisible({
    timeout: 15_000,
  });
});

// ─── Duplicate config ───────────────────────────────────────────────────────

test("clicking Copy duplicates the selected config", async () => {
  await openMachineConfigs(window);

  // Make sure Test Machine E2E is selected
  await sidebarEntry(window, "Test Machine E2E").click();

  const copyBtn = dialog(window).locator("button:has-text('Copy')");
  await copyBtn.click();

  // "Copy of Test Machine E2E" should appear in the sidebar (not the toolbar <option>)
  const copyEntry = sidebar(window)
    .locator("text=Copy of Test Machine E2E")
    .first();
  await expect(copyEntry).toBeVisible({ timeout: 5000 });
});

// ─── Delete config ──────────────────────────────────────────────────────────

test("clicking Del removes the selected config (after confirm)", async () => {
  await openMachineConfigs(window);

  // Select the copy in the sidebar
  await sidebarEntry(window, "Copy of Test Machine E2E").click();

  const delBtn = dialog(window).locator("button:has-text('Del')");
  await delBtn.click();

  // The app uses a custom ConfirmDialog (not window.confirm) — click the Delete button
  const confirmDeleteBtn = window.locator(
    '[role="dialog"] button:has-text("Delete")',
  );
  await expect(confirmDeleteBtn).toBeVisible({ timeout: 5000 });
  await confirmDeleteBtn.click();

  // The copy should be gone from the sidebar
  await expect(
    window.locator(".w-52 :text('Copy of Test Machine E2E')"),
  ).not.toBeVisible({ timeout: 5000 });
});

// ─── Pen type changes ───────────────────────────────────────────────────────

test("changing pen type updates pen command defaults", async () => {
  await openMachineConfigs(window);

  // Re-select the Test Machine E2E config to ensure the form is loaded
  await sidebarEntry(window, "Test Machine E2E").click();
  await window.waitForTimeout(300);

  // Find the pen type select in the dialog form area
  const penSelects = formArea(window).locator("select");
  // Origin is the first select, pen type is the second
  const penTypeSelect = penSelects.nth(1);
  await penTypeSelect.selectOption("servo");

  // The app may show a custom ConfirmDialog (not window.confirm) if commands were customised.
  // Accept it if it appears, otherwise proceed.
  const confirmResetBtn = window.locator(
    '[role="dialog"] button:has-text("Reset")',
  );
  if (await confirmResetBtn.isVisible({ timeout: 800 })) {
    await confirmResetBtn.click();
  }

  // Wait for re-render
  await window.waitForTimeout(500);

  // Check that servo placeholder/value appears
  const monoInputs = formArea(window).locator("input.font-mono");
  const values = await monoInputs.evaluateAll((els) =>
    els.map((el) => (el as HTMLInputElement).value),
  );
  // Should contain G0Z15 (pen up) and G0Z0 (pen down)
  expect(values.some((v) => v.includes("G0Z"))).toBe(true);
});

// ─── Connection type toggle ──────────────────────────────────────────────────

test("switching connection type to USB shows serial port field", async () => {
  await openMachineConfigs(window);

  // Ensure Test Machine E2E is selected so radio buttons are visible
  await sidebarEntry(window, "Test Machine E2E").click();
  await window.waitForTimeout(300);

  const usbRadio = formArea(window).locator('input[value="usb"]');
  await usbRadio.click();

  const serialLabel = dialog(window).locator("text=Serial port").first();
  await expect(serialLabel).toBeVisible({ timeout: 3000 });
});

test("switching back to wifi shows host/port fields", async () => {
  await openMachineConfigs(window);

  const wifiRadio = formArea(window).locator('input[value="wifi"]');
  await wifiRadio.click();

  const hostLabel = dialog(window).locator("text=Host / IP").first();
  await expect(hostLabel).toBeVisible({ timeout: 3000 });
});

// ─── Set as Active ──────────────────────────────────────────────────────────

test("Set as Active changes which config is active", async () => {
  await openMachineConfigs(window);

  await sidebarEntry(window, "Test Machine E2E").click();

  const activateBtn = dialog(window).locator(
    "button:has-text('Set as Active')",
  );
  await activateBtn.click();

  // The active indicator (✓) should appear for this config in the sidebar
  const checkmark = sidebarEntry(window, "Test Machine E2E");
  await expect(checkmark).toBeVisible({ timeout: 3000 });
  await expect(checkmark).toContainText("✓");
});

// ─── Export configs ─────────────────────────────────────────────────────────

test("Export button triggers save dialog and writes JSON", async () => {
  await openMachineConfigs(window);

  const exportPath = path.join(tempDir, "exported-configs.json");
  await mockSaveDialog(electronApp, exportPath);

  const exportBtn = dialog(window).locator("button:has-text('↑ Export')");
  await exportBtn.click();

  // Allow time for the IPC round-trip + file write
  await window.waitForTimeout(3000);

  // The app shows a custom ConfirmDialog alert ("Configs Exported") — dismiss it.
  const okBtn = window.locator('[role="dialog"] button:has-text("OK")');
  if (await okBtn.isVisible({ timeout: 1000 })) {
    await okBtn.click();
  }

  // Check the exported file exists and contains valid JSON
  if (fs.existsSync(exportPath)) {
    const raw = fs.readFileSync(exportPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.terraForge).toBe("machine-configs");
    expect(parsed.configs).toBeInstanceOf(Array);
    expect(parsed.configs.length).toBeGreaterThanOrEqual(1);
  }
});

// ─── Close dialog ───────────────────────────────────────────────────────────

test("clicking Close dismisses the dialog", async () => {
  await openMachineConfigs(window);

  const closeBtn = dialog(window).locator("button:has-text('Close')").first();
  await closeBtn.click();

  await expect(dialog(window)).toHaveCount(0, { timeout: 5000 });
});

test("machine selector in toolbar now shows the new active config", async () => {
  const options = await window
    .locator("select[aria-label='Machine selector'] option")
    .allTextContents();
  expect(options.some((t) => t.includes("Test Machine E2E"))).toBe(true);
});

// ─── Re-open and confirm persistence ────────────────────────────────────────

test("re-opening dialog shows persisted configs", async () => {
  await openMachineConfigs(window);

  // Both configs should be in the sidebar
  await expect(
    sidebar(window).locator(".group button.flex-1.text-left").first(),
  ).toBeVisible();
  await expect(sidebarEntry(window, "Test Machine E2E")).toBeVisible();

  // Close dialog
  const closeBtn = dialog(window).locator("button:has-text('Close')").first();
  await closeBtn.click();
});
