import type { BrowserWindow } from "electron";

/**
 * Plugin host windows are real BrowserWindows that the user never sees. That
 * makes them invisible to people but *not* to Electron's window bookkeeping:
 * while one is alive, `window-all-closed` never fires and `getAllWindows()`
 * is non-empty, so the app would refuse to quit after the last real window
 * closed. Everything that reasons about "are any app windows left" filters
 * through here.
 */
const pluginHostWindows = new WeakSet<BrowserWindow>();

export function markPluginHostWindow(win: BrowserWindow): void {
  pluginHostWindows.add(win);
}

export function isPluginHostWindow(win: BrowserWindow): boolean {
  return pluginHostWindows.has(win);
}

/** Windows the user can actually see and interact with. */
export function appWindows(all: BrowserWindow[]): BrowserWindow[] {
  return all.filter((win) => !isPluginHostWindow(win));
}
