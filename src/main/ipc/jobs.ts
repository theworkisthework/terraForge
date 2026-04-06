import { ipcMain } from "electron";
import type { TaskManager } from "../../tasks/taskManager";
import type { MachineConfig, GcodeOptions, VectorObject } from "../../types";

export function registerJobIpcHandlers(
  taskManager: TaskManager,
  safeSend: (channel: string, ...args: unknown[]) => void,
): void {
  ipcMain.handle(
    "jobs:generateGcode",
    async (
      _e,
      taskId: string,
      _objects: VectorObject[],
      _config: MachineConfig,
      _options: GcodeOptions,
    ) => {
      taskManager.create(taskId, "gcode-generate", "Generating G-code");
      return "delegated";
    },
  );

  ipcMain.on(
    "jobs:gcodeProgress",
    (_e, taskId: string, progress: number | null) => {
      taskManager.update(taskId, { progress });
      safeSend("task:update", taskManager.get(taskId));
    },
  );

  ipcMain.on("jobs:gcodeComplete", (_e, taskId: string) => {
    taskManager.complete(taskId);
    safeSend("task:update", taskManager.get(taskId));
  });

  ipcMain.on("jobs:gcodeFailed", (_e, taskId: string, error: string) => {
    taskManager.fail(taskId, error);
    safeSend("task:update", taskManager.get(taskId));
  });
}
