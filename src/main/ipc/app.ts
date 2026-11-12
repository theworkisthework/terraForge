import { app, ipcMain } from "electron";
import { openExternalUrl } from "../security/externalLinks";

export function registerAppIpcHandlers(): void {
  ipcMain.handle("app:getVersion", () => app.getVersion());

  // Rejects for anything but an https or mailto link.
  ipcMain.handle("app:openExternal", (_e, url: unknown) => openExternalUrl(url));
}
