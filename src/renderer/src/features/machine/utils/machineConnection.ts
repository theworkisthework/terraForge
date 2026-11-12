/**
 * Connecting to and disconnecting from a machine over its configured
 * transport: Wi-Fi WebSocket or USB serial.
 */
import { v4 as uuid } from "uuid";
import type { BackgroundTask, MachineConfig } from "../../../../../types";
import { useMachineStore } from "../../../store/machineStore";
import { useTaskStore } from "../../../store/taskStore";

/**
 * How long a Wi-Fi machine has to send its first WebSocket frame before its
 * connection task says it is not answering. The socket normally opens, and
 * the first status report arrives, within a second or two; main retries a
 * socket that will not open every few seconds.
 */
export const FIRST_RESPONSE_TIMEOUT_MS = 20_000;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Connects to the machine, shown as a task.
 *
 * Resolves once the connection has been set up — or has failed, which is
 * logged and shown on the task; it never rejects. For serial that is the
 * port being open, and the task reads "Connected". For Wi-Fi it is only the
 * machine having been found: its WebSocket opens afterwards, so the machine
 * is marked connected (which offers Disconnect, and shows "Connecting…" in
 * the toolbar) while the task stays running until the machine's first frame
 * arrives. The task can be cancelled at any point before then.
 */
export async function connectMachine(cfg: MachineConfig): Promise<void> {
  const { connection } = cfg;
  const taskId = uuid();
  const tasks = useTaskStore.getState();
  const machine = useMachineStore.getState;
  const task = (label: string, progress: number | null, status: BackgroundTask["status"], error?: string) =>
    tasks.upsertTask({ id: taskId, type: "ws-connect", label, progress, status, ...(error !== undefined ? { error } : {}) });

  if (connection.type !== "wifi") {
    task(`Connecting to ${connection.serialPath}…`, null, "running");
    try {
      await window.terraForge.serial.connect(connection.serialPath!, 115200);
      machine().setConnected(true);
      task("Connected", 100, "completed");
    } catch (err) {
      console.error("Connection failed", err);
      task("Connection failed", null, "error", errorText(err));
    }
    return;
  }

  const host = connection.host!;
  let cancelled = false;
  /** Stops watching for the first frame; set once the watch has started. */
  let stopWatching = () => {};
  tasks.registerCancelCallback(taskId, () => {
    cancelled = true;
    stopWatching();
    task("Connection cancelled", null, "cancelled");
    // Also ends a connection attempt still looking for the machine.
    void disconnectMachine(cfg).catch((err) => console.error("Disconnect failed", err));
    machine().setConnected(false);
  });

  task(`Connecting to ${host}…`, null, "running");
  // A frame from an earlier connection says nothing about this one.
  machine().setWsLive(false);
  try {
    await window.terraForge.fluidnc.connectWebSocket(host, connection.port ?? 80, connection.wsPort);
  } catch (err) {
    // Cancelling makes the attempt fail; the task already says "cancelled".
    if (cancelled) return;
    tasks.unregisterCancelCallback(taskId);
    console.error("Connection failed", err);
    task("Connection failed", null, "error", errorText(err));
    return;
  }
  if (cancelled) return;

  machine().setConnected(true);
  if (machine().wsLive) {
    tasks.unregisterCancelCallback(taskId);
    task("Connected", 100, "completed");
    return;
  }

  task(`Waiting for ${host} to respond…`, null, "running");
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    tasks.unregisterCancelCallback(taskId);
    task(
      `No response from ${host}`,
      null,
      "error",
      `${host} was found, but has not answered on its WebSocket. terraForge will keep trying; Disconnect to stop.`,
    );
  }, FIRST_RESPONSE_TIMEOUT_MS);
  const unsubscribe = useMachineStore.subscribe((state) => {
    if (state.wsLive) {
      stopWatching();
      tasks.unregisterCancelCallback(taskId);
      task("Connected", 100, "completed");
    } else if (!state.connected) {
      // Disconnected before it ever answered.
      stopWatching();
      tasks.unregisterCancelCallback(taskId);
      // An error saying it will keep trying is no longer true.
      if (timedOut) tasks.removeTask(taskId);
      else task("Connection cancelled", null, "cancelled");
    }
  });
  stopWatching = () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

/** Closes the machine's connection. */
export async function disconnectMachine(cfg: MachineConfig): Promise<void> {
  if (cfg.connection.type === "wifi") await window.terraForge.fluidnc.disconnectWebSocket();
  else await window.terraForge.serial.disconnect();
}
