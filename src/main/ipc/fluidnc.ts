import { ipcMain } from "electron";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, unlink } from "fs/promises";
import { FluidNCClient } from "../../machine/fluidnc";
import { SerialClient } from "../../machine/serial";
import { TaskManager } from "../../tasks/taskManager";
import type { PathGrants } from "../security/pathGrants";

export interface FluidNCIpcOptions {
  fluidnc: FluidNCClient;
  serial: SerialClient;
  getConnectionType: () => "wifi" | "serial" | null;
  setConnectionType: (type: "wifi" | "serial" | null) => void;
  safeSend: (channel: string, ...args: unknown[]) => void;
  taskManager: TaskManager;
  /** The local files the window may upload from and download to. */
  pathGrants: PathGrants;
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

  // Over serial, pause/resume/abort are Grbl realtime characters. Each
  // rejects when the control could not be sent, so the renderer can say so.
  const jobControl = (channel: string, realtime: string, overWifi: () => Promise<void>) =>
    ipcMain.handle(channel, () => {
      if (getConnectionType() === null) return Promise.reject(new Error("Not connected"));
      return overSerial() ? serial.sendRealtime(realtime) : overWifi();
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
function registerTransferHandlers({ fluidnc, taskManager, pathGrants }: FluidNCIpcOptions): void {
  const transferAbortControllers = new Map<string, AbortController>();

  /**
   * Runs one transfer as a task: cancellable, with progress sent to the
   * renderer (the TaskManager's updates are forwarded as `task:update`),
   * completed or failed at the end. Resolves only when the transfer
   * finished. A failure is rethrown and a cancelled transfer rejects too, so
   * a caller can never carry on (say, to run the file) as if it had arrived.
   */
  const trackTransfer = async (
    taskId: string,
    type: "file-upload" | "file-download",
    label: string,
    transfer: (onProgress: (progress: number) => void, signal: AbortSignal) => Promise<void>,
  ): Promise<void> => {
    const abortController = new AbortController();
    transferAbortControllers.set(taskId, abortController);
    taskManager.registerCancelHandler(taskId, () => abortController.abort());
    taskManager.create(taskId, type, label);
    const onProgress = (progress: number) => taskManager.update(taskId, { progress });
    try {
      await transfer(onProgress, abortController.signal);
    } catch (err: unknown) {
      if (!taskManager.isCancelled(taskId)) {
        taskManager.fail(taskId, String(err));
        throw err;
      }
    } finally {
      taskManager.clearCancelHandler(taskId);
      transferAbortControllers.delete(taskId);
    }
    // Cancelled, whether the transfer stopped for it or finished regardless:
    // the task already reads "cancelled", and the caller must not proceed.
    if (taskManager.isCancelled(taskId)) throw new Error("Transfer cancelled");
    taskManager.complete(taskId);
  };

  ipcMain.handle("fluidnc:uploadGcode", async (_e, taskId: string, content: string, remotePath: string) => {
    // Use the desired remote filename for the temp file so the multipart
    // form carries the right name — FluidNC writes the multipart filename
    // to the SD card, not the local path.
    const remoteFilename = remotePath.split(/[\\/]/).pop()!;
    const tempPath = join(tmpdir(), `tf-${Date.now()}-${remoteFilename}`);
    try {
      await trackTransfer(taskId, "file-upload", `Uploading ${remoteFilename}`, async (onProgress, signal) => {
        await writeFile(tempPath, content, "utf-8");
        // The filename override makes the SD card get the right name.
        await fluidnc.uploadFile(tempPath, remotePath, onProgress, remoteFilename, signal);
      });
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  });

  // The local end of a transfer is a path from the window, held to the same
  // rule as `fs:readFile` and `fs:writeFile`: the user picked it in a dialog.
  // Checked before the task starts, so a refusal is not reported as a transfer.
  ipcMain.handle("fluidnc:uploadFile", async (_e, taskId: string, localPath: unknown, remotePath: string) => {
    const source = pathGrants.check(localPath, "read");
    await trackTransfer(taskId, "file-upload", `Uploading ${remotePath}`, (onProgress, signal) =>
      fluidnc.uploadFile(source, remotePath, onProgress, undefined, signal),
    );
  });

  ipcMain.handle(
    "fluidnc:downloadFile",
    async (_e, taskId: string, remotePath: string, localPath: unknown, filesystem?: "internal" | "sdcard") => {
      const destination = pathGrants.check(localPath, "write");
      await trackTransfer(taskId, "file-download", `Downloading ${remotePath}`, (onProgress, signal) =>
        fluidnc.downloadFile(remotePath, destination, filesystem, onProgress, signal),
      );
    },
  );
}

/**
 * Serial connection. Status goes to the same channel as Wi-Fi status so the
 * renderer doesn't need to care which transport is active.
 */
function registerSerialHandlers({ serial, getConnectionType, setConnectionType, safeSend }: FluidNCIpcOptions): void {
  ipcMain.handle("serial:listPorts", () => serial.listPorts());

  // The port closed on its own: an unplugged cable or a device reset. Nothing
  // reconnects a serial port, so the renderer is told the connection is gone.
  serial.on("disconnected", (reason: string) => {
    if (getConnectionType() === "serial") setConnectionType(null);
    safeSend("serial:data", `[terraForge] Serial connection lost: ${reason}`);
    safeSend("serial:disconnected", reason);
  });

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

}
