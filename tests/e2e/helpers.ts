/**
 * Shared helpers for launching the terraForge Electron app from Playwright.
 *
 * Usage:
 *   import { launchApp, closeApp as teardown } from "./helpers";
 *   const { electronApp, window } = await launchApp();
 */
import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..");

interface AppHandle {
  electronApp: ElectronApplication;
  window: Page;
}

/**
 * Launch the Electron application from the built output.
 * Callers should run `npm run build` before invoking E2E tests.
 */
export async function launchApp(): Promise<AppHandle> {
  const electronApp = await electron.launch({
    args: [path.join(ROOT, "out", "main", "index.js")],
    cwd: ROOT,
  });

  // Wait for the first BrowserWindow to be ready
  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  return { electronApp, window };
}

/**
 * Gracefully close the application.
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  await app.close();
}
