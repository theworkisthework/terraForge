import { FluidNCClient } from "../../machine/fluidnc";
import { SerialClient } from "../../machine/serial";
import { TaskManager } from "../../tasks/taskManager";
import type { BackgroundTask, MachineStatus } from "../../types";

export interface PushEventForwardersOptions {
  taskManager: TaskManager;
  fluidnc: FluidNCClient;
  serial: SerialClient;
  safeSend: (channel: string, ...args: unknown[]) => void;
}

export function registerPushEventForwarders(
  options: PushEventForwardersOptions,
): void {
  const { taskManager, fluidnc, serial, safeSend } = options;

  taskManager.on("task-update", (task: BackgroundTask) => {
    safeSend("task:update", task);
  });

  // Wi-Fi events
  fluidnc.on("status", (status: MachineStatus) => {
    safeSend("fluidnc:status", status);
  });

  fluidnc.on("console", (message: string) => {
    safeSend("fluidnc:console", message);
  });

  fluidnc.on("ping", () => {
    safeSend("fluidnc:ping");
  });

  fluidnc.on("firmware", (info: string | null) => {
    safeSend("fluidnc:firmware", info);
  });

  // Serial events — status goes to the same channel as Wi-Fi status so the
  // renderer does not need to care which transport is active.
  // Also emit a ping so the 15s watchdog timer stays alive over serial.
  serial.on("status", (status: MachineStatus) => {
    safeSend("fluidnc:status", status);
    safeSend("fluidnc:ping");
  });

  serial.on("data", (data: string) => {
    safeSend("serial:data", data);
  });
}
