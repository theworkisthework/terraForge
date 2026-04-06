import { ipcMain } from "electron";
import { join } from "path";
import { tmpdir } from "os";
import { readFile, writeFile, unlink } from "fs/promises";
import { FluidNCClient } from "../../machine/fluidnc";
import { SerialClient } from "../../machine/serial";
import { TaskManager } from "../../tasks/taskManager";

export function registerFluidncIpcHandlers(options: {
  fluidnc: FluidNCClient;
  serial: SerialClient;
  getConnectionType: () => "wifi" | "serial" | null;
  setConnectionType: (type: "wifi" | "serial" | null) => void;
  safeSend: (channel: string, ...args: unknown[]) => void;
  taskManager: TaskManager;
}): void {
  const {
    fluidnc,
    serial,
    getConnectionType,
    setConnectionType,
    safeSend,
    taskManager,
  } = options;

  // All handlers transparently route to either the HTTP client (Wi-Fi) or the
  // serial command layer (USB) depending on which transport is active.

  ipcMain.handle("fluidnc:getStatus", () => {
    if (getConnectionType() === "serial") return serial.sendCommand("?");
    return fluidnc.getStatus();
  });

  ipcMain.handle("fluidnc:sendCommand", (_e, cmd: string) => {
    if (getConnectionType() === "serial") return serial.sendCommand(cmd);
    return fluidnc.sendCommand(cmd);
  });

  ipcMain.handle("fluidnc:listFiles", (_e, path?: string) => {
    if (getConnectionType() === "serial") return serial.listFiles(path);
    return fluidnc.listFiles(path);
  });

  ipcMain.handle("fluidnc:listSDFiles", (_e, path?: string) => {
    if (getConnectionType() === "serial") return serial.listSDFiles(path);
    return fluidnc.listSDFiles(path);
  });

  ipcMain.handle(
    "fluidnc:fetchFileText",
    (_e, remotePath: string, filesystem?: "internal" | "sdcard") => {
      if (getConnectionType() === "serial")
        return serial.fetchFileText(remotePath, filesystem);
      return fluidnc.fetchFileText(remotePath, filesystem);
    },
  );

  ipcMain.handle(
    "fluidnc:deleteFile",
    (_e, remotePath: string, source?: "sd" | "fs") => {
      if (getConnectionType() === "serial")
        return serial.deleteFile(remotePath, source ?? "sd");
      return fluidnc.deleteFile(remotePath, source ?? "fs");
    },
  );

  ipcMain.handle(
    "fluidnc:runFile",
    (_e, remotePath: string, filesystem?: "sd" | "fs") => {
      if (getConnectionType() === "serial")
        return serial.runFile(remotePath, filesystem ?? "sd");
      return fluidnc.runFile(remotePath, filesystem);
    },
  );

  ipcMain.handle("fluidnc:pauseJob", () => {
    if (getConnectionType() === "serial") {
      serial.sendRealtime("!");
      return;
    }
    return fluidnc.pauseJob();
  });

  ipcMain.handle("fluidnc:resumeJob", () => {
    if (getConnectionType() === "serial") {
      serial.sendRealtime("~");
      return;
    }
    return fluidnc.resumeJob();
  });

  ipcMain.handle("fluidnc:abortJob", () => {
    if (getConnectionType() === "serial") {
      serial.sendRealtime("\x18");
      return;
    }
    return fluidnc.abortJob();
  });

  ipcMain.handle(
    "fluidnc:connectWebSocket",
    (_e, host: string, port: number, wsPort?: number) => {
      setConnectionType("wifi");
      return fluidnc.connectWebSocket(host, port, wsPort);
    },
  );

  ipcMain.handle("fluidnc:disconnectWebSocket", () => {
    setConnectionType(null);
    return fluidnc.disconnectWebSocket();
  });

  ipcMain.handle(
    "fluidnc:uploadGcode",
    async (_e, taskId: string, content: string, remotePath: string) => {
      // Use the desired remote filename for the temp file so the multipart
      // form carries the right name — FluidNC writes the multipart filename
      // to the SD card, not the local path.
      const remoteFilename = remotePath.split(/[\\/]/).pop()!;
      const tempPath = join(tmpdir(), `tf-${Date.now()}-${remoteFilename}`);
      taskManager.create(taskId, "file-upload", `Uploading ${remoteFilename}`);
      try {
        await writeFile(tempPath, content, "utf-8");
        await fluidnc.uploadFile(
          tempPath,
          remotePath,
          (progress) => {
            taskManager.update(taskId, { progress });
            safeSend("task:update", taskManager.get(taskId));
          },
          remoteFilename, // ← override multipart filename so SD card gets the right name
        );
        taskManager.complete(taskId);
        safeSend("task:update", taskManager.get(taskId));
      } catch (err: unknown) {
        taskManager.fail(taskId, String(err));
        safeSend("task:update", taskManager.get(taskId));
        throw err;
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    },
  );

  ipcMain.handle(
    "fluidnc:uploadFile",
    async (_e, taskId: string, localPath: string, remotePath: string) => {
      taskManager.create(taskId, "file-upload", `Uploading ${remotePath}`);
      try {
        await fluidnc.uploadFile(localPath, remotePath, (progress) => {
          taskManager.update(taskId, { progress });
          safeSend("task:update", taskManager.get(taskId));
        });
        taskManager.complete(taskId);
      } catch (err: unknown) {
        taskManager.fail(taskId, String(err));
      }
    },
  );

  ipcMain.handle(
    "fluidnc:downloadFile",
    async (
      _e,
      taskId: string,
      remotePath: string,
      localPath: string,
      filesystem?: "internal" | "sdcard",
    ) => {
      taskManager.create(taskId, "file-download", `Downloading ${remotePath}`);
      try {
        await fluidnc.downloadFile(
          remotePath,
          localPath,
          filesystem,
          (progress) => {
            taskManager.update(taskId, { progress });
            safeSend("task:update", taskManager.get(taskId));
          },
        );
        taskManager.complete(taskId);
      } catch (err: unknown) {
        taskManager.fail(taskId, String(err));
      }
    },
  );

  // ─── Serial handlers ───────────────────────────────────────────────────────
  // Status goes to the same channel as Wi-Fi status so the renderer doesn't
  // need to care which transport is active. Also emit a ping so the 15s watchdog
  // timer stays alive over serial.

  ipcMain.handle("serial:listPorts", () => serial.listPorts());

  ipcMain.handle(
    "serial:connect",
    async (_e, path: string, baudRate?: number) => {
      await serial.connect(path, baudRate);
      setConnectionType("serial");
      // Start polling `?` for status reports (same cadence as WS $RI=500).
      serial.startStatusPolling(500);
      safeSend(
        "serial:data",
        `[terraForge] Serial connected to ${path} @ ${baudRate ?? 115200} baud`,
      );
    },
  );

  ipcMain.handle("serial:disconnect", async () => {
    serial.stopStatusPolling();
    setConnectionType(null);
    await serial.disconnect();
  });

  ipcMain.handle("serial:send", (_e, data: string) => serial.send(data));
}
