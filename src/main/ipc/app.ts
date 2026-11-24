import { app, ipcMain } from "electron";

export function registerAppIpcHandlers(): void {
  ipcMain.handle("app:getVersion", () => app.getVersion());
}
