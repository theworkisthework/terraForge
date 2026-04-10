import { app, ipcMain, shell } from "electron";

export function registerAppIpcHandlers(): void {
  ipcMain.handle("app:getVersion", () => app.getVersion());

  ipcMain.handle("app:openExternal", (_e, url: string) =>
    shell.openExternal(url),
  );
}
