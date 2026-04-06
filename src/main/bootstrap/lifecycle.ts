import { app, BrowserWindow } from "electron";

interface AppLifecycleOptions {
  createMainWindow: () => void;
  onReady?: () => void;
  onBeforeQuit?: () => void;
}

export function registerAppLifecycleHandlers({
  createMainWindow,
  onReady,
  onBeforeQuit,
}: AppLifecycleOptions): void {
  app.whenReady().then(() => {
    createMainWindow();
    onReady?.();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
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
