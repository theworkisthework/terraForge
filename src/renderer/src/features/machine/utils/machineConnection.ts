/**
 * Connecting to and disconnecting from a machine over its configured
 * transport: Wi-Fi WebSocket or USB serial.
 */
import { v4 as uuid } from "uuid";
import type { BackgroundTask, MachineConfig } from "../../../../../types";

/** Opens the machine's connection, shown as a task; `onConnected` runs
 * once it is open, before the task reads "Connected". A failure is logged
 * and shown on the task. */
export async function connectMachine(
  cfg: MachineConfig,
  upsertTask: (task: BackgroundTask) => void,
  onConnected: () => void,
): Promise<void> {
  const taskId = uuid();
  const { connection } = cfg;
  const task = (label: string, progress: number | null, status: BackgroundTask["status"], error?: string) =>
    upsertTask({ id: taskId, type: "ws-connect", label, progress, status, ...(error !== undefined ? { error } : {}) });
  task(`Connecting to ${connection.type === "wifi" ? connection.host : connection.serialPath}…`, null, "running");
  try {
    if (connection.type === "wifi") {
      await window.terraForge.fluidnc.connectWebSocket(connection.host!, connection.port ?? 80, connection.wsPort);
    } else {
      await window.terraForge.serial.connect(connection.serialPath!, 115200);
    }
    onConnected();
    task("Connected", 100, "completed");
  } catch (err) {
    console.error("Connection failed", err);
    task("Connection failed", null, "error", err instanceof Error ? err.message : String(err));
  }
}

/** Closes the machine's connection. */
export async function disconnectMachine(cfg: MachineConfig): Promise<void> {
  if (cfg.connection.type === "wifi") await window.terraForge.fluidnc.disconnectWebSocket();
  else await window.terraForge.serial.disconnect();
}
