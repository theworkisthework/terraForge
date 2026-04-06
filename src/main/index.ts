import { app, ipcMain, dialog, shell } from "electron";
import { join } from "path";
import { tmpdir } from "os";
import { readFile, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { registerAppLifecycleHandlers } from "./bootstrap/lifecycle";
import { createMainWindow, getMainWindow, safeSend } from "./bootstrap/window";
import {
  buildApplicationMenu,
  registerMenuStateHandlers,
} from "./menu/applicationMenu";
import { registerAppIpcHandlers } from "./ipc/app";
import { registerConfigIpcHandlers } from "./ipc/config";
import { registerJobIpcHandlers } from "./ipc/jobs";
import { registerTaskIpcHandlers } from "./ipc/tasks";
import { FluidNCClient } from "../machine/fluidnc";
import { SerialClient } from "../machine/serial";
import { TaskManager } from "../tasks/taskManager";
import type {
  MachineConfig,
  PageSize,
  MachineStatus,
  RemoteFile,
  BackgroundTask,
} from "../types";

registerMenuStateHandlers();

registerAppLifecycleHandlers({
  createMainWindow,
  onReady: () => buildApplicationMenu(safeSend),
  // Gracefully close the FluidNC WebSocket before the process exits so the
  // machine receives a proper WS close frame instead of a TCP RST.  A TCP RST
  // (from os-level socket teardown on process kill) can wedge the ESP32's WS
  // server slot, requiring a power cycle to recover.
  onBeforeQuit: () => {
    fluidnc.disconnectWebSocket();
  },
});

// ─── Singletons ───────────────────────────────────────────────────────────────

const fluidnc = new FluidNCClient();
const serial = new SerialClient();
const taskManager = new TaskManager();

// Tracks which transport is currently active so IPC handlers can route correctly.
let connectionType: "wifi" | "serial" | null = null;

// ─── Push events to renderer ──────────────────────────────────────────────────

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
// renderer doesn't need to care which transport is active.
// Also emit a ping so the 15s watchdog timer stays alive over serial.
serial.on("status", (status: MachineStatus) => {
  safeSend("fluidnc:status", status);
  safeSend("fluidnc:ping");
});

serial.on("data", (data: string) => {
  safeSend("serial:data", data);
});

// ─── Machine Config Persistence ───────────────────────────────────────────────

const configPath = join(app.getPath("userData"), "machine-configs.json");

async function loadConfigs(): Promise<MachineConfig[]> {
  if (!existsSync(configPath)) return getDefaultConfigs();
  try {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw) as MachineConfig[];
  } catch {
    return getDefaultConfigs();
  }
}

async function saveConfigs(configs: MachineConfig[]): Promise<void> {
  await writeFile(configPath, JSON.stringify(configs, null, 2), "utf-8");
}

function getDefaultConfigs(): MachineConfig[] {
  return [
    {
      id: "terrapen-default",
      name: "TerraPen (Default)",
      bedWidth: 220,
      bedHeight: 200,
      origin: "bottom-left",
      penType: "solenoid",
      penUpCommand: "M5",
      penDownCommand: "M3 S1000",
      feedrate: 3000,
      connection: {
        type: "wifi",
        host: "fluidnc.local",
        port: 80,
      },
    },
  ];
}

// ─── Page-Size Persistence ────────────────────────────────────────────────────
// Users can customise the available page sizes by editing page-sizes.json in the
// app's userData directory.  If the file is absent the built-in defaults are used.

const pageSizesPath = join(app.getPath("userData"), "page-sizes.json");

const BUILT_IN_PAGE_SIZES: PageSize[] = [
  { id: "a2", name: "A2", widthMM: 420, heightMM: 594 },
  { id: "a3", name: "A3", widthMM: 297, heightMM: 420 },
  { id: "a4", name: "A4", widthMM: 210, heightMM: 297 },
  { id: "a5", name: "A5", widthMM: 148, heightMM: 210 },
  { id: "a6", name: "A6", widthMM: 105, heightMM: 148 },
  { id: "letter", name: "Letter", widthMM: 215.9, heightMM: 279.4 },
  { id: "legal", name: "Legal", widthMM: 215.9, heightMM: 355.6 },
  { id: "tabloid", name: "Tabloid", widthMM: 279.4, heightMM: 431.8 },
];

async function loadPageSizes(): Promise<PageSize[]> {
  if (!existsSync(pageSizesPath)) {
    await writeFile(
      pageSizesPath,
      JSON.stringify(BUILT_IN_PAGE_SIZES, null, 2),
      "utf-8",
    );
    return BUILT_IN_PAGE_SIZES;
  }
  try {
    const raw = await readFile(pageSizesPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as PageSize[];
    return BUILT_IN_PAGE_SIZES;
  } catch {
    return BUILT_IN_PAGE_SIZES;
  }
}

registerConfigIpcHandlers({
  getMainWindow,
  loadConfigs,
  saveConfigs,
  loadPageSizes,
  pageSizesPath,
  builtInPageSizes: BUILT_IN_PAGE_SIZES,
});

registerAppIpcHandlers();

// ─── IPC Handlers — FluidNC ──────────────────────────────────────────────────
// All handlers transparently route to either the HTTP client (Wi-Fi) or the
// serial command layer (USB) depending on which transport is active.

ipcMain.handle("fluidnc:getStatus", () => {
  if (connectionType === "serial") return serial.sendCommand("?");
  return fluidnc.getStatus();
});

ipcMain.handle("fluidnc:sendCommand", (_e, cmd: string) => {
  if (connectionType === "serial") return serial.sendCommand(cmd);
  return fluidnc.sendCommand(cmd);
});

ipcMain.handle("fluidnc:listFiles", (_e, path?: string) => {
  if (connectionType === "serial") return serial.listFiles(path);
  return fluidnc.listFiles(path);
});

ipcMain.handle("fluidnc:listSDFiles", (_e, path?: string) => {
  if (connectionType === "serial") return serial.listSDFiles(path);
  return fluidnc.listSDFiles(path);
});

ipcMain.handle(
  "fluidnc:fetchFileText",
  (_e, remotePath: string, filesystem?: "internal" | "sdcard") => {
    if (connectionType === "serial")
      return serial.fetchFileText(remotePath, filesystem);
    return fluidnc.fetchFileText(remotePath, filesystem);
  },
);

ipcMain.handle(
  "fluidnc:deleteFile",
  (_e, remotePath: string, source?: "sd" | "fs") => {
    if (connectionType === "serial")
      return serial.deleteFile(remotePath, source ?? "sd");
    return fluidnc.deleteFile(remotePath, source ?? "fs");
  },
);

ipcMain.handle(
  "fluidnc:runFile",
  (_e, remotePath: string, filesystem?: "sd" | "fs") => {
    if (connectionType === "serial")
      return serial.runFile(remotePath, filesystem ?? "sd");
    return fluidnc.runFile(remotePath, filesystem);
  },
);

ipcMain.handle("fluidnc:pauseJob", () => {
  if (connectionType === "serial") {
    serial.sendRealtime("!");
    return;
  }
  return fluidnc.pauseJob();
});

ipcMain.handle("fluidnc:resumeJob", () => {
  if (connectionType === "serial") {
    serial.sendRealtime("~");
    return;
  }
  return fluidnc.resumeJob();
});

ipcMain.handle("fluidnc:abortJob", () => {
  if (connectionType === "serial") {
    serial.sendRealtime("\x18");
    return;
  }
  return fluidnc.abortJob();
});

ipcMain.handle(
  "fluidnc:connectWebSocket",
  (_e, host: string, port: number, wsPort?: number) => {
    connectionType = "wifi";
    return fluidnc.connectWebSocket(host, port, wsPort);
  },
);

ipcMain.handle("fluidnc:disconnectWebSocket", () => {
  connectionType = null;
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
    const task = taskManager.create(
      taskId,
      "file-upload",
      `Uploading ${remotePath}`,
    );
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
    const task = taskManager.create(
      taskId,
      "file-download",
      `Downloading ${remotePath}`,
    );
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

// ─── IPC Handlers — Serial ────────────────────────────────────────────────────

ipcMain.handle("serial:listPorts", () => serial.listPorts());

ipcMain.handle(
  "serial:connect",
  async (_e, path: string, baudRate?: number) => {
    await serial.connect(path, baudRate);
    connectionType = "serial";
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
  connectionType = null;
  await serial.disconnect();
});

ipcMain.handle("serial:send", (_e, data: string) => serial.send(data));

// ─── IPC Handlers — File System ───────────────────────────────────────────────

ipcMain.handle("fs:openSvgDialog", async () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import SVG",
    filters: [{ name: "SVG Files", extensions: ["svg"] }],
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("fs:openPdfDialog", async () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import PDF",
    filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("fs:openFileDialog", async () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select File to Upload",
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("fs:openImportDialog", async () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import File",
    filters: [
      {
        name: "Supported Files",
        extensions: [
          "svg",
          "pdf",
          "gcode",
          "nc",
          "g",
          "gc",
          "gco",
          "ngc",
          "ncc",
          "cnc",
          "tap",
        ],
      },
      { name: "SVG Files", extensions: ["svg"] },
      { name: "PDF Files", extensions: ["pdf"] },
      {
        name: "G-code Files",
        extensions: [
          "gcode",
          "nc",
          "g",
          "gc",
          "gco",
          "ngc",
          "ncc",
          "cnc",
          "tap",
        ],
      },
    ],
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("fs:openGcodeDialog", async () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import G-code",
    filters: [
      {
        name: "G-code Files",
        extensions: [
          "gcode",
          "nc",
          "g",
          "gc",
          "gco",
          "ngc",
          "ncc",
          "cnc",
          "tap",
        ],
      },
    ],
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("fs:readFile", (_e, filePath: string) =>
  readFile(filePath, "utf-8"),
);

// Returns raw bytes as a Buffer, which IPC transfers as Uint8Array in the renderer.
ipcMain.handle("fs:readFileBinary", (_e, filePath: string) =>
  readFile(filePath),
);

ipcMain.handle("fs:writeFile", (_e, filePath: string, content: string) =>
  writeFile(filePath, content, "utf-8"),
);

ipcMain.handle("fs:saveGcodeDialog", async (_e, defaultName: string) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save G-code",
    defaultPath: defaultName,
    filters: [{ name: "G-code Files", extensions: ["gcode", "nc", "cnc"] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle("fs:saveFileDialog", async (_e, defaultName: string) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save File",
    defaultPath: defaultName,
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle("fs:saveLayoutDialog", async (_e, defaultName: string) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Canvas Layout",
    defaultPath: defaultName,
    filters: [{ name: "terraForge Layout", extensions: ["tforge"] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle("fs:openLayoutDialog", async () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Canvas Layout",
    filters: [{ name: "terraForge Layout", extensions: ["tforge"] }],
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("fs:chooseDirectory", async () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose folder for G-code files",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle("fs:loadConfigs", () => loadConfigs());
ipcMain.handle("fs:saveConfigs", (_e, configs: MachineConfig[]) =>
  saveConfigs(configs),
);

// ─── IPC Handlers — Tasks ─────────────────────────────────────────────────────

registerTaskIpcHandlers(taskManager);

registerJobIpcHandlers(taskManager, safeSend);
