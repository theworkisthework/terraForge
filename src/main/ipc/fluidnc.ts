import { ipcMain } from "electron";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, unlink } from "fs/promises";
import { FluidNCClient } from "../../machine/fluidnc";
import { SerialClient } from "../../machine/serial";
import { TaskManager } from "../../tasks/taskManager";

export interface FluidNCIpcOptions {
  fluidnc: FluidNCClient;
  serial: SerialClient;
  getConnectionType: () => "wifi" | "serial" | null;
  setConnectionType: (type: "wifi" | "serial" | null) => void;
  safeSend: (channel: string, ...args: unknown[]) => void;
  taskManager: TaskManager;
}

export function registerFluidncIpcHandlers(options: FluidNCIpcOptions): void {
  registerMachineHandlers(options);
  registerTransferHandlers(options);
  registerSerialHandlers(options);
}

/**
 * Commands, file listing and job control. Each routes to either the HTTP
 * client (Wi-Fi) or the serial command layer (USB), whichever transport is
 * active, so the renderer need not care which.
 */
function registerMachineHandlers({ fluidnc, serial, getConnectionType, setConnectionType }: FluidNCIpcOptions): void {
  const overSerial = () => getConnectionType() === "serial";

  ipcMain.handle("fluidnc:getStatus", () => (overSerial() ? serial.sendCommand("?") : fluidnc.getStatus()));

  ipcMain.handle("fluidnc:sendCommand", (_e, cmd: string) => {
    const connType = getConnectionType();
    if (connType === null) return Promise.reject(new Error("Not connected"));
    if (connType === "serial") return serial.sendCommand(cmd);
    return fluidnc.sendCommand(cmd);
  });

  ipcMain.handle("fluidnc:listFiles", (_e, path?: string) =>
    overSerial() ? serial.listFiles(path) : fluidnc.listFiles(path),
  );

  ipcMain.handle("fluidnc:listSDFiles", (_e, path?: string) =>
    overSerial() ? serial.listSDFiles(path) : fluidnc.listSDFiles(path),
  );

  ipcMain.handle("fluidnc:fetchFileText", (_e, remotePath: string, filesystem?: "internal" | "sdcard") =>
    overSerial() ? serial.fetchFileText(remotePath, filesystem) : fluidnc.fetchFileText(remotePath, filesystem),
  );

  ipcMain.handle("fluidnc:deleteFile", (_e, remotePath: string, source?: "sd" | "fs") =>
    overSerial() ? serial.deleteFile(remotePath, source ?? "sd") : fluidnc.deleteFile(remotePath, source ?? "fs"),
  );

  ipcMain.handle("fluidnc:runFile", (_e, remotePath: string, filesystem?: "sd" | "fs") =>
    overSerial() ? serial.runFile(remotePath, filesystem ?? "sd") : fluidnc.runFile(remotePath, filesystem),
  );

  // Over serial, pause/resume/abort are Grbl realtime characters.
  const jobControl = (channel: string, realtime: string, overWifi: () => unknown) =>
    ipcMain.handle(channel, () => {
      if (overSerial()) {
        serial.sendRealtime(realtime);
        return;
      }
      return overWifi();
    });
  jobControl("fluidnc:pauseJob", "!", () => fluidnc.pauseJob());
  jobControl("fluidnc:resumeJob", "~", () => fluidnc.resumeJob());
  jobControl("fluidnc:abortJob", "\x18", () => fluidnc.abortJob());

  ipcMain.handle("fluidnc:connectWebSocket", (_e, host: string, port: number, wsPort?: number) => {
    setConnectionType("wifi");
    return fluidnc.connectWebSocket(host, port, wsPort);
  });

  ipcMain.handle("fluidnc:disconnectWebSocket", () => {
    setConnectionType(null);
    return fluidnc.disconnectWebSocket();
  });
}

/** Uploads and downloads, each tracked as a cancellable background task. */
function registerTransferHandlers({ fluidnc, safeSend, taskManager }: FluidNCIpcOptions): void {
  const transferAbortControllers = new Map<string, AbortController>();

  /**
   * Runs one transfer as a task: cancellable, with progress sent to the
   * renderer, completed or failed at the end. With `reportOutcome` the final
   * state is sent too, and a failure is rethrown to the caller.
   */
  const trackTransfer = async (
    taskId: string,
    type: "file-upload" | "file-download",
    label: string,
    reportOutcome: boolean,
    transfer: (onProgress: (progress: number) => void, signal: AbortSignal) => Promise<void>,
  ): Promise<void> => {
    const abortController = new AbortController();
    transferAbortControllers.set(taskId, abortController);
    taskManager.registerCancelHandler(taskId, () => abortController.abort());
    taskManager.create(taskId, type, label);
    const onProgress = (progress: number) => {
      taskManager.update(taskId, { progress });
      safeSend("task:update", taskManager.get(taskId));
    };
    try {
      await transfer(onProgress, abortController.signal);
      if (!taskManager.isCancelled(taskId)) taskManager.complete(taskId);
      if (reportOutcome) safeSend("task:update", taskManager.get(taskId));
    } catch (err: unknown) {
      if (!taskManager.isCancelled(taskId)) {
        taskManager.fail(taskId, String(err));
        if (reportOutcome) {
          safeSend("task:update", taskManager.get(taskId));
          throw err;
        }
      }
    } finally {
      taskManager.clearCancelHandler(taskId);
      transferAbortControllers.delete(taskId);
    }
  };

  ipcMain.handle("fluidnc:uploadGcode", async (_e, taskId: string, content: string, remotePath: string) => {
    // Use the desired remote filename for the temp file so the multipart
    // form carries the right name — FluidNC writes the multipart filename
    // to the SD card, not the local path.
    const remoteFilename = remotePath.split(/[\\/]/).pop()!;
    const tempPath = join(tmpdir(), `tf-${Date.now()}-${remoteFilename}`);
    try {
      await trackTransfer(taskId, "file-upload", `Uploading ${remoteFilename}`, true, async (onProgress, signal) => {
        await writeFile(tempPath, content, "utf-8");
        // The filename override makes the SD card get the right name.
        await fluidnc.uploadFile(tempPath, remotePath, onProgress, remoteFilename, signal);
      });
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  });

  ipcMain.handle("fluidnc:uploadFile", (_e, taskId: string, localPath: string, remotePath: string) =>
    trackTransfer(taskId, "file-upload", `Uploading ${remotePath}`, false, (onProgress, signal) =>
      fluidnc.uploadFile(localPath, remotePath, onProgress, undefined, signal),
    ),
  );

  ipcMain.handle(
    "fluidnc:downloadFile",
    (_e, taskId: string, remotePath: string, localPath: string, filesystem?: "internal" | "sdcard") =>
      trackTransfer(taskId, "file-download", `Downloading ${remotePath}`, false, (onProgress, signal) =>
        fluidnc.downloadFile(remotePath, localPath, filesystem, onProgress, signal),
      ),
  );
}

/**
 * Serial connection. Status goes to the same channel as Wi-Fi status so the
 * renderer doesn't need to care which transport is active.
 */
function registerSerialHandlers({ serial, setConnectionType, safeSend }: FluidNCIpcOptions): void {
  ipcMain.handle("serial:listPorts", () => serial.listPorts());

  ipcMain.handle("serial:connect", async (_e, path: string, baudRate?: number) => {
    await serial.connect(path, baudRate);
    setConnectionType("serial");
    // Poll `?` for status reports, at the same cadence as WS $RI=500.
    serial.startStatusPolling(500);
    safeSend("serial:data", `[terraForge] Serial connected to ${path} @ ${baudRate ?? 115200} baud`);
  });

  ipcMain.handle("serial:disconnect", async () => {
    serial.stopStatusPolling();
    setConnectionType(null);
    await serial.disconnect();
  });

  ipcMain.handle("serial:send", (_e, data: string) => serial.send(data));
}
