import { app, BrowserWindow } from "electron";
import { appWindows, isPluginHostWindow } from "../plugins/pluginHostWindows";

interface AppLifecycleOptions {
  createMainWindow: () => void;
  onReady?: () => void;
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

  app.on("before-quit", () => {
    onBeforeQuit?.();
  });
}
