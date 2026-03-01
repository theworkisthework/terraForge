/**
 * Shared helpers for launching the terraForge Electron app from Playwright.
 *
 * Usage:
 *   import { launchApp, closeApp } from "./helpers";
 *   const app = await launchApp();
 *   // ... interact with app.window ...
 *   await closeApp(app.electronApp);
 */
import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.resolve(__dirname, "..", "fixtures");

export interface AppHandle {
  electronApp: ElectronApplication;
  window: Page;
  /** Temporary user-data directory used by this app instance. */
  userDataDir: string;
}

/**
 * Launch the Electron application from the built output.
 *
 * Each launch creates a **fresh temporary user-data directory** via
 * Chromium's `--user-data-dir` flag so tests are completely isolated
 * from the real user's configs, cache, etc.
 *
 * Callers should run `npm run build` (or `electron-vite build`) first.
 */
export async function launchApp(): Promise<AppHandle> {
  const mainEntry = path.join(ROOT, "out", "main", "index.js");
  if (!fs.existsSync(mainEntry)) {
    throw new Error(
      `Built main entry not found at ${mainEntry}. Run "npm run build" first.`,
    );
  }

  // Create a throw-away user-data directory so the app never reads or
  // writes the real user's machine-configs.json or any other persisted state.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "terraforge-e2e-"));

  // On Linux CI runners the SUID sandbox helper is not configured, so we must
  // disable the sandbox.  --no-sandbox is safe in ephemeral CI environments.
  const sandboxArgs =
    process.platform === "linux"
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : [];

  const electronApp = await electron.launch({
    args: [...sandboxArgs, `--user-data-dir=${userDataDir}`, mainEntry],
    cwd: ROOT,
    env: {
      ...process.env,
      // Ensure stable test environment
      NODE_ENV: "test",
    },
  });

  // Wait for the first BrowserWindow to be ready
  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  // Wait for React to hydrate — look for the brand name that Toolbar always renders
  await window.locator("text=terraForge").first().waitFor({ timeout: 15_000 });

  return { electronApp, window, userDataDir };
}

/**
 * Gracefully close the application and remove its temporary user-data
 * directory so nothing leaks between test suites.
 */
export async function closeApp(
  app: ElectronApplication,
  userDataDir?: string,
): Promise<void> {
  await app.close();
  if (userDataDir) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

/**
 * Get the path to a test fixture file.
 */
export function fixturePath(filename: string): string {
  return path.join(FIXTURES, filename);
}

/**
 * Mock the Electron native file-open dialog to return a specific file path.
 * This patches dialog.showOpenDialogSync / showOpenDialog on the main process
 * so the next call returns the given path without user interaction.
 */
export async function mockOpenDialog(
  electronApp: ElectronApplication,
  filePath: string,
): Promise<void> {
  await electronApp.evaluate(async ({ dialog }, fPath) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [fPath] });
    (dialog as any).showOpenDialogSync = () => [fPath];
  }, filePath);
}

/**
 * Mock the Electron native file-save dialog to return a specific file path.
 */
export async function mockSaveDialog(
  electronApp: ElectronApplication,
  filePath: string,
): Promise<void> {
  await electronApp.evaluate(async ({ dialog }, fPath) => {
    dialog.showSaveDialog = () =>
      Promise.resolve({ canceled: false, filePath: fPath });
    (dialog as any).showSaveDialogSync = () => fPath;
  }, filePath);
}

/**
 * Cancel the next Electron native dialog.
 */
export async function mockCancelDialog(
  electronApp: ElectronApplication,
): Promise<void> {
  await electronApp.evaluate(async ({ dialog }) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: true, filePaths: [] });
    dialog.showSaveDialog = () =>
      Promise.resolve({ canceled: true, filePath: "" });
  });
}

/**
 * Mock window.confirm in the renderer to always return a given value.
 */
export async function mockConfirm(
  window: Page,
  returnValue: boolean,
): Promise<void> {
  await window.evaluate((val) => {
    (window as any).__originalConfirm =
      (window as any).__originalConfirm ?? window.confirm;
    window.confirm = () => val;
  }, returnValue);
}

/**
 * Restore window.confirm after mocking.
 */
export async function restoreConfirm(window: Page): Promise<void> {
  await window.evaluate(() => {
    if ((window as any).__originalConfirm) {
      window.confirm = (window as any).__originalConfirm;
    }
  });
}

/**
 * Take a screenshot with a descriptive name (for debugging failures).
 */
export async function screenshot(window: Page, name: string): Promise<Buffer> {
  return window.screenshot({
    path: path.join(ROOT, "test-results", `${name}.png`),
  });
}
