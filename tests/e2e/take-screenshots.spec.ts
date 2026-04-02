/**
 * Screenshot capture suite for the terraForge user guide.
 *
 * Run with:
 *   npx playwright test tests/e2e/take-screenshots.spec.ts --config=tests/e2e/playwright.config.ts
 *
 * All screenshots are saved to docs/resources/ as PNG files.
 * After running, the user guide placeholders should be replaced with the
 * generated images.
 *
 * NOTE: Some screenshots (job-running, console-alarm) require a live machine
 * connection — those capture a "best available" offline state instead.
 */
import { test } from "@playwright/test";
import {
  launchApp,
  closeApp,
  fixturePath,
  mockOpenDialog,
  mockIpcInvoke,
  pushRendererEvent,
} from "./helpers";
import type { ElectronApplication, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "docs", "resources");

// Ensure output directory exists
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

/** Save a screenshot of the full window. */
async function shot(window: Page, filename: string): Promise<void> {
  const dest = path.join(OUT_DIR, filename);
  await window.screenshot({ path: dest, animations: "disabled" });
  console.log(`  ✓ ${filename}`);
}

/** Save a screenshot clipped to a specific element. */
async function shotElement(
  window: Page,
  selector: string,
  filename: string,
  padding = 8,
): Promise<void> {
  const el = window.locator(selector).first();
  await el.waitFor({ timeout: 5000 });
  const box = await el.boundingBox();
  if (!box) {
    console.warn(
      `  ⚠ bounding box not found for "${selector}" — falling back to full window`,
    );
    await shot(window, filename);
    return;
  }
  const dest = path.join(OUT_DIR, filename);
  await window.screenshot({
    path: dest,
    animations: "disabled",
    clip: {
      x: Math.max(0, box.x - padding),
      y: Math.max(0, box.y - padding),
      width: box.width + padding * 2,
      height: box.height + padding * 2,
    },
  });
  console.log(`  ✓ ${filename}`);
}

// ─── App setup ───────────────────────────────────────────────────────────────

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());
  // Use a consistent 1440 × 900 viewport for all screenshots
  await window.setViewportSize({ width: 1440, height: 900 });
  // Brief settle time after resize
  await window.waitForTimeout(300);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
});

// ─── 01: Full application at launch ─────────────────────────────────────────

test("01-full-app — initial launch state", async () => {
  await shot(window, "01-full-app.png");
});

// ─── 02: Settings button in toolbar ─────────────────────────────────────────

test("02-settings-btn — toolbar with settings button highlighted", async () => {
  // Capture just the toolbar (header element)
  await shotElement(window, "header", "02-settings-btn.png", 0);
});

// ─── 03: Machine Config dialog — empty/default state ────────────────────────

test("03-machine-config-empty — config dialog before selecting a config", async () => {
  // Open the settings dialog
  const settingsBtn = window.locator("button:has-text('⚙')");
  await settingsBtn.click();
  await window
    .locator("h2:has-text('Machine Configurations')")
    .waitFor({ timeout: 5000 });
  // Give dialog a moment to fully render
  await window.waitForTimeout(200);
  await shot(window, "03-machine-config-empty.png");
});

// ─── 04: Machine Config dialog — TerraPen selected ──────────────────────────

test("04-machine-config-completed — default TerraPen config selected", async () => {
  // Click the TerraPen entry in the sidebar to populate the form
  const terrapenBtn = window
    .locator(".w-52 button:has-text('TerraPen')")
    .first();
  await terrapenBtn.click();
  await window.waitForTimeout(200);
  await shot(window, "04-machine-config-completed.png");

  // Close the dialog before next test
  const closeBtn = window.locator("button:has-text('Close')").first();
  await closeBtn.click();
  await window.waitForTimeout(200);
});

// ─── 05: Toolbar — Connect button visible ───────────────────────────────────

test("05-toolbar-connect — toolbar showing Connect button", async () => {
  // Select the TerraPen machine so the Connect button is enabled
  const machineSelect = window.locator("select[aria-label='Machine selector']");
  const options = await machineSelect.locator("option").all();
  // Pick the first non-placeholder option (TerraPen)
  for (const opt of options) {
    const val = await opt.getAttribute("value");
    if (val && val !== "") {
      await machineSelect.selectOption(val);
      break;
    }
  }
  await window.waitForTimeout(200);
  await shotElement(window, "header", "05-toolbar-connect.png", 0);
});

// ─── 06: Canvas after SVG import ────────────────────────────────────────────

test("06-canvas-after-import — canvas showing imported SVG on bed grid", async () => {
  const svgPath = fixturePath("sample.svg");
  await mockOpenDialog(electronApp, svgPath);
  await window.locator("button:has-text('Import')").click();

  // Wait for the import to appear in the Properties panel
  await window.locator("text=sample").first().waitFor({ timeout: 15_000 });
  await window.waitForTimeout(500);

  await shot(window, "06-canvas-after-import.png");
});

// ─── 07: Canvas with import selected ────────────────────────────────────────

test("07-canvas-selected — import selected, bounding box visible", async () => {
  // Click the 'sample' entry in the Properties panel to select it
  await window.locator("text=sample").first().click();
  await window.waitForTimeout(300);
  await shot(window, "07-canvas-selected.png");
});

// ─── 08: Canvas overlay controls ────────────────────────────────────────────

test("08-canvas-overlay — canvas overlay zoom controls", async () => {
  // The canvas overlay controls (zoom in/out, fit button) are in the canvas area.
  // Capture the centre main area which contains both canvas and overlays.
  await shotElement(window, "main", "08-canvas-overlay.png", 0);
});

// ─── 09: Object dragging (best-effort: selected near canvas edge) ────────────

test("09-canvas-dragging — selected object near bed edge (static)", async () => {
  // Show a selected object — similar to 07, just re-use the selected state.
  // Full drag interaction would require pointer capture; a static selected shot suffices.
  await shot(window, "09-canvas-dragging.png");
});

// ─── 10: Scale handles ───────────────────────────────────────────────────────

test("10-canvas-scale-handles — selected object with scale handles", async () => {
  // Same selected state as 07 — bounding box corners are the scale handles.
  await shot(window, "10-canvas-scale-handles.png");
});

// ─── 11: Properties panel — expanded import with path list ──────────────────

test("11-properties-expanded — properties panel showing expanded import", async () => {
  // Import the SVG if it wasn't already imported by an earlier test in the suite
  const alreadyImported = await window.locator("text=sample").count();
  if (alreadyImported === 0) {
    const svgPath = fixturePath("sample.svg");
    await mockOpenDialog(electronApp, svgPath);
    await window.locator("button:has-text('Import')").click();
    await window.locator("text=sample").first().waitFor({ timeout: 15_000 });
    await window.waitForTimeout(500);
  }

  // Collapse if already expanded (in case a previous run left it open)
  const collapseBtn = window
    .locator("button[aria-label='Collapse paths']")
    .first();
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click();
    await window.waitForTimeout(200);
  }

  // Click the expand toggle to show the path list
  const expandBtn = window.locator("button[aria-label='Expand paths']").first();
  await expandBtn.click();
  await window.waitForTimeout(300);
  // Capture just the right-panel aside
  await shotElement(
    window,
    "aside:last-of-type",
    "11-properties-expanded.png",
    0,
  );
});

// ─── 12: Properties panel — numeric fields for selected import ───────────────

test("12-properties-numeric — properties panel with X/Y/W/H fields visible", async () => {
  // Ensure the SVG is imported
  const alreadyImported = await window.locator("text=sample").count();
  if (alreadyImported === 0) {
    const svgPath = fixturePath("sample.svg");
    await mockOpenDialog(electronApp, svgPath);
    await window.locator("button:has-text('Import')").click();
    await window.locator("text=sample").first().waitFor({ timeout: 15_000 });
    await window.waitForTimeout(500);
  }

  // Collapse the path list if expanded (we want just the import row + numeric fields)
  const collapseBtn = window
    .locator("button[aria-label='Collapse paths']")
    .first();
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click();
    await window.waitForTimeout(200);
  }

  // Click the import row to select it and reveal the numeric fields
  await window.locator("text=sample").first().click();
  await window.waitForTimeout(300);

  await shotElement(
    window,
    "aside:last-of-type",
    "12-properties-numeric.png",
    0,
  );
});

// ─── 13: Properties panel — layer groups ─────────────────────────────────────

test("13-layer-groups — properties panel with layer groups section", async () => {
  // Remove any existing layer groups from previous runs
  while (
    (await window
      .locator('button[title="Delete group (layers become ungrouped)"]')
      .count()) > 0
  ) {
    await window
      .locator('button[title="Delete group (layers become ungrouped)"]')
      .first()
      .click();
    await window.waitForTimeout(150);
  }

  // Ensure we have at least 3 imports (one drag handle per import)
  let importCount = await window
    .locator('span[title="Drag to a group"]')
    .count();
  while (importCount < 3) {
    await mockOpenDialog(electronApp, fixturePath("sample.svg"));
    await window.locator("button:has-text('Import')").click();
    await window
      .locator('span[title="Drag to a group"]')
      .nth(importCount)
      .waitFor({ timeout: 15_000 });
    await window.waitForTimeout(400);
    importCount++;
  }

  // Deselect anything, collapse any expanded path lists
  await window.keyboard.press("Escape");
  await window.waitForTimeout(200);
  const collapseBtn = window
    .locator("button[aria-label='Collapse paths']")
    .first();
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click();
    await window.waitForTimeout(200);
  }

  // Scroll to top so the "Add layer group" (+) button is accessible
  const rightAside = window.locator("aside:last-of-type");
  await rightAside.evaluate((el) => (el.scrollTop = 0));
  await window.waitForTimeout(200);

  // Create 2 layer groups
  const addGroupBtn = window.locator('button[title="Add layer group"]');
  await addGroupBtn.click();
  await window.waitForTimeout(200);
  await addGroupBtn.click();
  await window.waitForTimeout(200);

  // Assign first two imports to the groups using dispatched DragEvents.
  // querySelectorAll returns a static NodeList so indices are safe across both
  // assigns, which both happen before React flushes the re-render.
  await window.evaluate(() => {
    const handles = document.querySelectorAll('span[title="Drag to a group"]');

    const assignToGroup = (handleEl: Element, groupNameText: string) => {
      const dt = new DataTransfer();
      // dragstart causes React to setData(importId) on our DataTransfer
      handleEl.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
      // Find the group header span by name + title attribute
      const targetSpan = Array.from(
        document.querySelectorAll<HTMLSpanElement>(
          'span[title="Double-click to rename"]',
        ),
      ).find((s) => s.textContent?.trim() === groupNameText);
      if (!targetSpan) return;
      // dragover + drop bubble up to the parent div with onDrop
      targetSpan.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
      targetSpan.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
      handleEl.dispatchEvent(
        new DragEvent("dragend", { bubbles: true, cancelable: true }),
      );
    };

    if (handles[0]) assignToGroup(handles[0], "Group 1");
    if (handles[1]) assignToGroup(handles[1], "Group 2");
  });
  await window.waitForTimeout(500);

  // Scroll to bottom to show the full groups section
  await rightAside.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await window.waitForTimeout(200);
  await shotElement(window, "aside:last-of-type", "13-layer-groups.png", 0);

  // Reset scroll for later tests
  await rightAside.evaluate((el) => (el.scrollTop = 0));
});

// ─── 14a: G-code Options dialog — Paths section ────────────────────────────

test("14a-gcode-paths — G-code options dialog with Paths section open", async () => {
  // Ensure at least one SVG is imported so the Generate G-code button is enabled
  const alreadyImported = await window.locator("text=sample").count();
  if (alreadyImported === 0) {
    const svgPath = fixturePath("sample.svg");
    await mockOpenDialog(electronApp, svgPath);
    await window.locator("button:has-text('Import')").click();
    await window.locator("text=sample").first().waitFor({ timeout: 15_000 });
    await window.waitForTimeout(500);
  }

  const btn = window.locator("button:has-text('Generate G-code')");
  await btn.click();
  await window
    .locator("h2:has-text('Generate G-code')")
    .waitFor({ timeout: 5_000 });
  await window.waitForTimeout(200);
  // Close the Output section (open by default) so only Paths is expanded
  const outputBtnA = window.locator("button", { hasText: /^Output$/i }).first();
  await outputBtnA.click();
  await window.waitForTimeout(150);
  // Open the Paths section (collapsed by default)
  const pathsBtn = window.locator("button", { hasText: /^Paths$/i }).first();
  await pathsBtn.click();
  await window.waitForTimeout(200);
  await shot(window, "14a-gcode-paths.png");
  // Close dialog
  await window.locator("button:has-text('Cancel')").click();
  await window.waitForTimeout(200);
});

// ─── 14b: G-code Options dialog — Options section ───────────────────────────

test("14b-gcode-options-section — G-code options dialog with Options section open", async () => {
  const btn = window.locator("button:has-text('Generate G-code')");
  await btn.click();
  await window
    .locator("h2:has-text('Generate G-code')")
    .waitFor({ timeout: 5_000 });
  await window.waitForTimeout(200);
  // Close the Output section (open by default) so only Options is expanded
  const outputBtnB = window.locator("button", { hasText: /^Output$/i }).first();
  await outputBtnB.click();
  await window.waitForTimeout(150);
  // Open the Options section (collapsed by default)
  const optionsBtn = window
    .locator("button", { hasText: /^Options$/i })
    .first();
  await optionsBtn.click();
  await window.waitForTimeout(200);
  await shot(window, "14b-gcode-options-section.png");
  // Close dialog
  await window.locator("button:has-text('Cancel')").click();
  await window.waitForTimeout(200);
});

// ─── 14c: G-code Options dialog — Output section (default) ──────────────────

test("14c-gcode-output — G-code options dialog with Output section open (default)", async () => {
  const btn = window.locator("button:has-text('Generate G-code')");
  await btn.click();
  await window
    .locator("h2:has-text('Generate G-code')")
    .waitFor({ timeout: 5_000 });
  await window.waitForTimeout(300);
  // Output section is open by default
  await shot(window, "14c-gcode-output.png");
  // Close dialog
  await window.locator("button:has-text('Cancel')").click();
  await window.waitForTimeout(200);
});

// ─── 15: File Browser panel ──────────────────────────────────────────────────

test("15-file-browser — file browser panel with both sections", async () => {
  // Mock IPC so connecting and listing files succeeds without real hardware
  await mockIpcInvoke(electronApp, "fluidnc:connectWebSocket", undefined);
  await mockIpcInvoke(electronApp, "fluidnc:disconnectWebSocket", undefined);
  await mockIpcInvoke(electronApp, "fluidnc:listSDFiles", [
    {
      name: "portrait.gcode",
      path: "/portrait.gcode",
      size: 12480,
      isDirectory: false,
    },
    {
      name: "landscape.gcode",
      path: "/landscape.gcode",
      size: 8920,
      isDirectory: false,
    },
    {
      name: "monogram.gcode",
      path: "/monogram.gcode",
      size: 5230,
      isDirectory: false,
    },
    { name: "jobs", path: "/jobs", size: 0, isDirectory: true },
  ]);
  await mockIpcInvoke(electronApp, "fluidnc:listFiles", [
    {
      name: "config.yaml",
      path: "/config.yaml",
      size: 2048,
      isDirectory: false,
    },
    { name: "wifi.yaml", path: "/wifi.yaml", size: 512, isDirectory: false },
  ]);

  // Connect so the file browser loads its listings
  await window.locator("button:has-text('Connect')").click();
  await window
    .locator("button:has-text('Disconnect')")
    .waitFor({ timeout: 10_000 });
  await window
    .locator("text=portrait.gcode")
    .first()
    .waitFor({ timeout: 5_000 });
  await window.waitForTimeout(300);

  // Expand the internal pane so both sections show content
  await window.locator("span.uppercase:has-text('internal')").first().click();
  await window.locator("text=config.yaml").first().waitFor({ timeout: 5_000 });
  await window.waitForTimeout(200);

  await shotElement(window, "aside:first-of-type", "15-file-browser.png", 0);
  // Leave connected for test 16
});

// ─── 16: File row action buttons ─────────────────────────────────────────────

test("16-file-row-buttons — file browser showing file row with action buttons", async () => {
  // Still connected from test 15 — hover a gcode file to reveal its action buttons
  const fileRow = window.locator("[data-testid='file-row-portrait.gcode']");
  await fileRow.hover();
  await window.waitForTimeout(200);
  await shotElement(
    window,
    "aside:first-of-type",
    "16-file-row-buttons.png",
    0,
  );

  // Disconnect to restore offline state for subsequent tests
  await window.locator("button:has-text('Disconnect')").click();
  await window
    .locator("button:has-text('Connect')")
    .waitFor({ timeout: 5_000 });
  await window.waitForTimeout(200);
});

// ─── 17: Job panel — selected file, Start button ─────────────────────────────

test("17-job-panel — job panel with connected machine and file selected", async () => {
  // Connect with mocked IPC (reuse mocks from tests 15/16; reconnect if needed)
  const isConnected =
    (await window.locator("button:has-text('Disconnect')").count()) > 0;
  if (!isConnected) {
    await mockIpcInvoke(electronApp, "fluidnc:connectWebSocket", undefined);
    await mockIpcInvoke(electronApp, "fluidnc:disconnectWebSocket", undefined);
    await mockIpcInvoke(electronApp, "fluidnc:listSDFiles", [
      {
        name: "portrait.gcode",
        path: "/portrait.gcode",
        size: 12480,
        isDirectory: false,
      },
    ]);
    await mockIpcInvoke(electronApp, "fluidnc:listFiles", []);
    await window.locator("button:has-text('Connect')").click();
    await window
      .locator("button:has-text('Disconnect')")
      .waitFor({ timeout: 10_000 });
    await window
      .locator("text=portrait.gcode")
      .first()
      .waitFor({ timeout: 5_000 });
    await window.waitForTimeout(300);
  }

  // Push an Idle status so the machine is fully ready
  await pushRendererEvent(electronApp, "fluidnc:status", {
    raw: "<Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000>",
    state: "Idle",
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
  });
  await window.waitForTimeout(200);

  // Select portrait.gcode as the job file by clicking its row
  await window.locator("text=portrait.gcode").first().click();
  await window.waitForTimeout(200);

  await shotElement(window, ".h-40", "17-job-panel.png", 0);
});

// ─── 18: Job panel during running job ──────────────────────────────────

test("18-job-running — job panel showing running job with progress bar", async () => {
  // Push a Run status with line progress to trigger the running UI
  await pushRendererEvent(electronApp, "fluidnc:status", {
    raw: "<Run|MPos:42.150,31.800,0.000|WPos:42.150,31.800,0.000|Ln:342,1024>",
    state: "Run",
    mpos: { x: 42.15, y: 31.8, z: 0 },
    wpos: { x: 42.15, y: 31.8, z: 0 },
    lineNum: 342,
    lineTotal: 1024,
  });
  await window.waitForTimeout(300);

  await shotElement(window, ".h-40", "18-job-running.png", 0);

  // Restore idle state and disconnect for subsequent tests
  await pushRendererEvent(electronApp, "fluidnc:status", {
    raw: "<Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000>",
    state: "Idle",
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
  });
  await window.waitForTimeout(200);
  await window.locator("button:has-text('Disconnect')").click();
  await window
    .locator("button:has-text('Connect')")
    .waitFor({ timeout: 5_000 });
  await window.waitForTimeout(200);
});

// ─── 19: Floating jog panel ───────────────────────────────────────────────────

test("19-jog-panel — floating jog panel", async () => {
  // The jog panel is shown by default (showJog = true on App mount).
  // It is a fixed z-30 panel. Try to capture it.
  // The panel has a drag handle (h-2.5 bar) then p-4 content.
  const jogPanel = window.locator(".fixed.z-30.bg-panel").first();
  const exists = await jogPanel.count();
  if (exists > 0) {
    await shotElement(window, ".fixed.z-30.bg-panel", "19-jog-panel.png", 8);
  } else {
    // Fall back to full window if panel selector doesn't match
    await shot(window, "19-jog-panel.png");
  }
});

// ─── 20: Console panel with output ────────────────────────────────────────────

test("20-console-panel — console panel showing output and input", async () => {
  // Ensure the machine is connected so the input field and Restart FW button are active
  const isConnected =
    (await window.locator("button:has-text('Disconnect')").count()) > 0;
  if (!isConnected) {
    await mockIpcInvoke(electronApp, "fluidnc:connectWebSocket", undefined);
    await mockIpcInvoke(electronApp, "fluidnc:disconnectWebSocket", undefined);
    await mockIpcInvoke(electronApp, "fluidnc:listSDFiles", []);
    await mockIpcInvoke(electronApp, "fluidnc:listFiles", []);
    await window.locator("button:has-text('Connect')").click();
    await window
      .locator("button:has-text('Disconnect')")
      .waitFor({ timeout: 10_000 });
    await window.waitForTimeout(300);
  }

  // Push an Idle status so the machine state badge is shown
  await pushRendererEvent(electronApp, "fluidnc:status", {
    raw: "<Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000|FS:0,0>",
    state: "Idle",
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
  });
  await window.waitForTimeout(100);

  // Inject realistic console lines that appear during a normal connection
  const lines = [
    "[terraForge] Connecting to fluidnc.local:80…",
    "Grbl 3.7.8 [FluidNC v3.7.8 (lax:wifi) '$' for help]",
    "[MSG:INFO: Connecting to STA SSID:Worknet]",
    "[MSG:INFO: Connected - IP is 192.168.1.42]",
    "<Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000|FS:0,0>",
    "> ?",
    "ok",
    "<Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000|FS:0,0>",
    "> $H",
    "ok",
    "[MSG:INFO: Homing]",
    "<Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000|FS:0,0>",
  ];
  for (const line of lines) {
    await pushRendererEvent(electronApp, "fluidnc:console", line);
  }
  await window.waitForTimeout(200);

  await shotElement(window, ".h-40", "20-console-panel.png", 0);
  // Leave connected for test 21
});

// ─── 21: Console panel — alarm state ─────────────────────────────────────────

test("21-console-alarm — console panel alarm state (pulsing red button)", async () => {
  // Push some alarm console messages
  await pushRendererEvent(electronApp, "fluidnc:console", "ALARM:1");
  await pushRendererEvent(
    electronApp,
    "fluidnc:console",
    "[MSG:Reset to continue]",
  );
  await window.waitForTimeout(100);

  // Push Alarm status — triggers the pulsing red '⚠ ALARM — click to unlock' button
  await pushRendererEvent(electronApp, "fluidnc:status", {
    raw: "<Alarm:1|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000>",
    state: "Alarm",
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
  });
  await window.waitForTimeout(300);

  await shotElement(window, ".h-40", "21-console-alarm.png", 0);

  // Restore idle state and disconnect for subsequent tests
  await pushRendererEvent(electronApp, "fluidnc:status", {
    raw: "<Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000>",
    state: "Idle",
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
  });
  await window.waitForTimeout(200);
  await window.locator("button:has-text('Disconnect')").click();
  await window
    .locator("button:has-text('Connect')")
    .waitFor({ timeout: 5_000 });
  await window.waitForTimeout(200);
});

// ─── 22: Toast stack during G-code generation ─────────────────────────────────

test("22-toast-stack — toast notification during G-code generation", async () => {
  // Click Generate G-code to open the options dialog
  const genBtn = window.locator("button:has-text('Generate G-code')");
  await genBtn.click();
  await window
    .locator("h2:has-text('Generate G-code')")
    .waitFor({ timeout: 5_000 });

  // Click Generate (no save / upload needed — just trigger the worker)
  // Uncheck "Upload to SD card" first so the task completes without an SD-upload IPC call
  const uploadCheckbox = window.locator(
    "label:has-text('Upload to SD card') input[type='checkbox']",
  );
  if (await uploadCheckbox.isChecked()) {
    await uploadCheckbox.uncheck();
  }

  // Ensure "Save to computer" is checked so neitherOutput stays false and the
  // Generate button remains enabled. Mock the save dialog to return "" (cancel)
  // so no native dialog appears and no file write is triggered.
  const saveCheckbox = window.locator(
    "label:has-text('Save to computer') input[type='checkbox']",
  );
  if (!(await saveCheckbox.isChecked())) {
    await saveCheckbox.check();
  }
  await mockIpcInvoke(electronApp, "fs:saveGcodeDialog", "");

  const dialogGenerateBtn = window
    .locator("button")
    .filter({ hasText: /^Generate$/ });
  await dialogGenerateBtn.click();

  // Capture as quickly as possible after generation starts — the toast is in the canvas area
  // Wait a very short time for the worker to start and emit its first progress update
  await window.waitForTimeout(150);
  await shot(window, "22-toast-stack.png");

  // Wait for generation to finish so subsequent tests start clean
  await genBtn.waitFor({ state: "visible" });
  await window
    .locator("button:has-text('Generate G-code')")
    .waitFor({ timeout: 30_000 });
});
