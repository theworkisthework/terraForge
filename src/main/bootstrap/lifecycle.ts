import { app, BrowserWindow } from "electron";
import { appWindows, isPluginHostWindow } from "../plugins/pluginHostWindows";

interface AppLifecycleOptions {
  createMainWindow: () => void;
  onReady?: () => void;
  /**
   * Asked when the app is about to quit. Return null to let it, or a promise
   * to hold the quit until it settles: the app then quits if it resolved
   * true and stays open otherwise.
   */
  confirmQuit?: () => Promise<boolean> | null;
  /** Runs once the app is really quitting — not for a quit that was held. */
  onBeforeQuit?: () => void;
  /**
   * Fired when the last window the user can see has closed. Bitmap plugin
   * hosts are hidden BrowserWindows, and while one is alive Electron never
   * emits `window-all-closed` — so they are torn down here, which then lets
   * that event fire and the app quit normally.
   */
  onAllAppWindowsClosed?: () => void;
}

export function registerAppLifecycleHandlers({
  createMainWindow,
  onReady,
  confirmQuit,
  onBeforeQuit,
  onAllAppWindowsClosed,
}: AppLifecycleOptions): void {
  app.whenReady().then(() => {
    createMainWindow();
    onReady?.();

    app.on("activate", () => {
      if (appWindows(BrowserWindow.getAllWindows()).length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("browser-window-created", (_event, win) => {
    if (isPluginHostWindow(win)) return;
    win.on("closed", () => {
      if (appWindows(BrowserWindow.getAllWindows()).length === 0) {
        onAllAppWindowsClosed?.();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", (event) => {
    const answer = confirmQuit?.() ?? null;
    if (answer) {
      event.preventDefault();
      // Quitting again asks again, and finds the answer already given.
      void answer.then((quit) => {
        if (quit) app.quit();
      });
      return;
    }
    onBeforeQuit?.();
  });
}
