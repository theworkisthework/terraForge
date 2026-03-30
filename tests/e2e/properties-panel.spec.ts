/**
 * E2E: Properties panel interactions.
 *
 * Imports sample.svg once in beforeAll, then verifies:
 *  - Import name displayed
 *  - Inline rename (confirm via Enter, cancel via Escape)
 *  - Visibility toggle (👁 / ○)
 *  - Path expand / collapse
 *  - Per-path visibility toggle and delete
 *  - Selecting an import row shows the position (X/Y) form
 *  - Delete import removes the row and restores empty state
 *
 * Tests run against the single shared app instance to minimise build-launch
 * overhead, but each group starts from a known state.
 */
import { test, expect } from "@playwright/test";
import { launchApp, closeApp, fixturePath, mockOpenDialog } from "./helpers";
import type { ElectronApplication, Page } from "playwright";

let electronApp: ElectronApplication;
let window: Page;
let userDataDir: string;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeAll(async () => {
  ({ electronApp, window, userDataDir } = await launchApp());

  // Import sample.svg so the panel has content to work with.
  await mockOpenDialog(electronApp, fixturePath("sample.svg"));
  await window.locator("button:has-text('Import')").click();

  // Wait until the import name appears.
  await expect(window.locator("text=sample").first()).toBeVisible({
    timeout: 15_000,
  });
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
});

// ─── Group 1: Import name displayed ──────────────────────────────────────────

test("Properties panel shows the imported file name 'sample'", async () => {
  await expect(window.locator("text=sample").first()).toBeVisible();
});

test("Properties panel shows path count badge (e.g. '7p')", async () => {
  const badge = window.locator("text=/\\d+p/").first();
  await expect(badge).toBeVisible();
  const txt = await badge.textContent();
  // sample.svg has several paths — at least 1
  expect(parseInt(txt ?? "0", 10)).toBeGreaterThanOrEqual(1);
});

test("empty-state message is not visible after import", async () => {
  await expect(
    window.locator("text=No objects. Import an SVG."),
  ).not.toBeVisible();
});

// ─── Group 2: Visibility toggle ───────────────────────────────────────────────

test("visibility indicator shows '👁' when import is visible", async () => {
  const vis = window.locator("span[title='Toggle visibility']").first();
  await expect(vis).toBeVisible();
  const txt = await vis.textContent();
  expect(txt?.trim()).toBe("👁");
});

test("clicking visibility indicator toggles it to '○' (hidden)", async () => {
  const vis = window.locator("span[title='Toggle visibility']").first();
  await vis.click();
  await expect(vis).toHaveText("○", { timeout: 3000 });
});

test("clicking visibility indicator again toggles back to '👁' (visible)", async () => {
  const vis = window.locator("span[title='Toggle visibility']").first();
  await vis.click();
  await expect(vis).toHaveText("👁", { timeout: 3000 });
});

// ─── Group 3: Path expand / collapse ─────────────────────────────────────────

test("'Expand paths' button is present and paths are initially collapsed", async () => {
  const expandBtn = window.locator("button[aria-label='Expand paths']").first();
  await expect(expandBtn).toBeVisible();
});

test("clicking 'Expand paths' shows the per-path list", async () => {
  const expandBtn = window.locator("button[aria-label='Expand paths']").first();
  await expandBtn.click();

  // Per-path rows have title="Toggle path visibility"
  const pathRow = window
    .locator("span[title='Toggle path visibility']")
    .first();
  await expect(pathRow).toBeVisible({ timeout: 3000 });
});

test("expand button label changes to 'Collapse paths' after expansion", async () => {
  const collapseBtn = window
    .locator("button[aria-label='Collapse paths']")
    .first();
  await expect(collapseBtn).toBeVisible({ timeout: 2000 });
});

test("clicking 'Collapse paths' hides the per-path list", async () => {
  const collapseBtn = window
    .locator("button[aria-label='Collapse paths']")
    .first();
  await collapseBtn.click();

  const pathRows = window.locator("span[title='Toggle path visibility']");
  await expect(pathRows).toHaveCount(0, { timeout: 3000 });
});

// ─── Group 4: Per-path operations ────────────────────────────────────────────

test("expanding paths shows individual path entries", async () => {
  const expandBtn = window.locator("button[aria-label='Expand paths']").first();
  await expandBtn.click();

  const pathRows = window.locator("span[title='Toggle path visibility']");
  const count = await pathRows.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test("per-path visibility toggle changes icon from '👁' to '○'", async () => {
  const firstPathVis = window
    .locator("span[title='Toggle path visibility']")
    .first();
  const before = await firstPathVis.textContent();
  await firstPathVis.click();
  const after = await firstPathVis.textContent();
  expect(before?.trim()).not.toBe(after?.trim());
});

test("per-path delete button removes one path from the expanded list", async () => {
  const pathRows = window.locator("span[title='Toggle path visibility']");
  const before = await pathRows.count();

  // Click the first per-path ✕ (title="Remove path")
  const deleteBtn = window.locator("button[title='Remove path']").first();
  await deleteBtn.click();

  // Row count should decrease by exactly 1
  await expect(pathRows).toHaveCount(before - 1, { timeout: 3000 });
});

// ─── Group 5: Import selection — position form ────────────────────────────────

test("clicking the import row selects it and shows the X (mm) field", async () => {
  // Collapse paths first so the row click targets the header row
  const collapseBtn = window.locator("button[aria-label='Collapse paths']");
  const collapseCount = await collapseBtn.count();
  if (collapseCount > 0) await collapseBtn.first().click();

  // Click the import row (the row containing the import name)
  await window.locator("span[title='Double-click to rename']").first().click();

  // The position form (numFields) should appear
  const xInput = window.locator("#numfield-x-mm");
  await expect(xInput).toBeVisible({ timeout: 3000 });
});

test("X position input accepts a new value", async () => {
  const xInput = window.locator("#numfield-x-mm");
  await xInput.click({ clickCount: 3 });
  await xInput.fill("25");
  await xInput.press("Tab");
  await expect(xInput).toHaveValue("25", { timeout: 2000 });
});

test("Y position input accepts a new value", async () => {
  const yInput = window.locator("#numfield-y-mm");
  await yInput.click({ clickCount: 3 });
  await yInput.fill("15");
  await yInput.press("Tab");
  await expect(yInput).toHaveValue("15", { timeout: 2000 });
});

// ─── Group 6: Inline rename ───────────────────────────────────────────────────

test("double-clicking the import name enters edit mode (input appears)", async () => {
  const nameSpan = window
    .locator("span[title='Double-click to rename']")
    .first();
  await nameSpan.dblclick();

  // An autoFocus input should appear
  const renameInput = window
    .locator("input.bg-app.border.border-accent")
    .first();
  await expect(renameInput).toBeVisible({ timeout: 3000 });
});

test("typing a new name and pressing Enter renames the import", async () => {
  // Trigger rename again (previous test may have dismissed it)
  const nameSpan = window
    .locator("span[title='Double-click to rename']")
    .first();
  if (await nameSpan.isVisible()) {
    await nameSpan.dblclick();
  }

  const renameInput = window
    .locator("input.bg-app.border.border-accent")
    .first();
  await renameInput.waitFor({ timeout: 3000 });
  await renameInput.fill("renamed");
  await renameInput.press("Enter");

  await expect(window.locator("text=renamed").first()).toBeVisible({
    timeout: 3000,
  });
  // Update the original name for later cleanup
});

test("pressing Escape during rename cancels without changing the name", async () => {
  const nameSpan = window
    .locator("span[title='Double-click to rename']")
    .first();
  await nameSpan.dblclick();

  const renameInput = window
    .locator("input.bg-app.border.border-accent")
    .first();
  await renameInput.waitFor({ timeout: 3000 });
  const originalName = await nameSpan.textContent().catch(() => "renamed");
  await renameInput.fill("should-not-save");
  await renameInput.press("Escape");

  // Input should be gone and name unchanged
  await expect(renameInput).not.toBeVisible({ timeout: 2000 });
  await expect(window.locator("text=should-not-save")).not.toBeVisible({
    timeout: 2000,
  });
});

// ─── Group 7: Delete import ───────────────────────────────────────────────────

test("clicking 'Delete import' ✕ removes the import row", async () => {
  const deleteBtn = window.locator("button[title='Delete import']").first();
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  // After delete the import row is gone
  await expect(window.locator("button[title='Delete import']")).toHaveCount(0, {
    timeout: 3000,
  });
});

test("empty state message reappears after all imports are deleted", async () => {
  await expect(window.locator("text=No objects. Import an SVG.")).toBeVisible({
    timeout: 3000,
  });
});
