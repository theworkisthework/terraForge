import { ipcMain } from "electron";
import type { TaskManager } from "../../tasks/taskManager";

export function registerTaskIpcHandlers(taskManager: TaskManager): void {
  ipcMain.handle("tasks:cancel", (_e, taskId: string) =>
    taskManager.cancel(taskId),
  );
}
