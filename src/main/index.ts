import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { FluidNCClient } from "../machine/fluidnc";
import { SerialClient } from "../machine/serial";
import { TaskManager } from "../tasks/taskManager";
import type {
  MachineConfig,
  VectorObject,
  GcodeOptions,
  MachineStatus,
  RemoteFile,
  BackgroundTask,
} from "../types";

// ─── Window Management ────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#1a1a2e",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── Singletons ───────────────────────────────────────────────────────────────

const fluidnc = new FluidNCClient();
const serial = new SerialClient();
const taskManager = new TaskManager();

// ─── Push task updates to renderer ───────────────────────────────────────────

taskManager.on("task-update", (task: BackgroundTask) => {
  mainWindow?.webContents.send("task:update", task);
});

fluidnc.on("status", (status: MachineStatus) => {
  mainWindow?.webContents.send("fluidnc:status", status);
});

fluidnc.on("console", (message: string) => {
  mainWindow?.webContents.send("fluidnc:console", message);
});

fluidnc.on("ping", () => {
  mainWindow?.webContents.send("fluidnc:ping");
});

serial.on("data", (data: string) => {
  mainWindow?.webContents.send("serial:data", data);
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

// ─── IPC Handlers — Config ────────────────────────────────────────────────────

ipcMain.handle("config:getMachineConfigs", () => loadConfigs());

ipcMain.handle(
  "config:saveMachineConfig",
  async (_e, config: MachineConfig) => {
    const configs = await loadConfigs();
    const idx = configs.findIndex((c) => c.id === config.id);
    if (idx >= 0) configs[idx] = config;
    else configs.push(config);
    await saveConfigs(configs);
  },
);

ipcMain.handle("config:deleteMachineConfig", async (_e, id: string) => {
  const configs = await loadConfigs();
  await saveConfigs(configs.filter((c) => c.id !== id));
});

// ─── IPC Handlers — FluidNC ───────────────────────────────────────────────────

ipcMain.handle("fluidnc:getStatus", () => fluidnc.getStatus());
ipcMain.handle("fluidnc:sendCommand", (_e, cmd: string) =>
  fluidnc.sendCommand(cmd),
);
ipcMain.handle("fluidnc:listFiles", (_e, path?: string) =>
  fluidnc.listFiles(path),
);
ipcMain.handle("fluidnc:listSDFiles", (_e, path?: string) =>
  fluidnc.listSDFiles(path),
);
ipcMain.handle(
  "fluidnc:fetchFileText",
  (_e, remotePath: string, filesystem?: "internal" | "sdcard") =>
    fluidnc.fetchFileText(remotePath, filesystem),
);
ipcMain.handle("fluidnc:deleteFile", (_e, remotePath: string) =>
  fluidnc.deleteFile(remotePath),
);
ipcMain.handle(
  "fluidnc:runFile",
  (_e, remotePath: string, filesystem?: "sd" | "fs") =>
    fluidnc.runFile(remotePath, filesystem),
);
ipcMain.handle("fluidnc:pauseJob", () => fluidnc.pauseJob());
ipcMain.handle("fluidnc:resumeJob", () => fluidnc.resumeJob());
ipcMain.handle("fluidnc:abortJob", () => fluidnc.abortJob());

ipcMain.handle("fluidnc:connectWebSocket", (_e, host: string, port: number) =>
  fluidnc.connectWebSocket(host, port),
);
ipcMain.handle("fluidnc:disconnectWebSocket", () =>
  fluidnc.disconnectWebSocket(),
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
        mainWindow?.webContents.send("task:update", taskManager.get(taskId));
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
          mainWindow?.webContents.send("task:update", taskManager.get(taskId));
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
ipcMain.handle("serial:connect", (_e, path: string, baudRate?: number) =>
  serial.connect(path, baudRate),
);
ipcMain.handle("serial:disconnect", () => serial.disconnect());
ipcMain.handle("serial:send", (_e, data: string) => serial.send(data));

// ─── IPC Handlers — File System ───────────────────────────────────────────────

ipcMain.handle("fs:openSvgDialog", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import SVG",
    filters: [{ name: "SVG Files", extensions: ["svg"] }],
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("fs:openFileDialog", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select File to Upload",
    properties: ["openFile"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("fs:readFile", (_e, filePath: string) =>
  readFile(filePath, "utf-8"),
);

ipcMain.handle("fs:writeFile", (_e, filePath: string, content: string) =>
  writeFile(filePath, content, "utf-8"),
);

ipcMain.handle("fs:saveGcodeDialog", async (_e, defaultName: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save G-code",
    defaultPath: defaultName,
    filters: [{ name: "G-code Files", extensions: ["gcode", "nc", "cnc"] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle("fs:saveFileDialog", async (_e, defaultName: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save File",
    defaultPath: defaultName,
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle("fs:loadConfigs", () => loadConfigs());
ipcMain.handle("fs:saveConfigs", (_e, configs: MachineConfig[]) =>
  saveConfigs(configs),
);

// ─── IPC Handlers — Tasks ─────────────────────────────────────────────────────

ipcMain.handle("tasks:cancel", (_e, taskId: string) =>
  taskManager.cancel(taskId),
);

// ─── IPC Handlers — Jobs (G-code generation, delegated to renderer worker) ───

ipcMain.handle(
  "jobs:generateGcode",
  async (
    _e,
    taskId: string,
    objects: VectorObject[],
    config: MachineConfig,
    options: GcodeOptions,
  ) => {
    // G-code generation is done in a Web Worker in the renderer.
    // Main process just tracks the task lifecycle.
    taskManager.create(taskId, "gcode-generate", "Generating G-code");
    // The renderer will push progress/completion via ipc
    return "delegated";
  },
);

ipcMain.on(
  "jobs:gcodeProgress",
  (_e, taskId: string, progress: number | null) => {
    taskManager.update(taskId, { progress });
    mainWindow?.webContents.send("task:update", taskManager.get(taskId));
  },
);

ipcMain.on("jobs:gcodeComplete", (_e, taskId: string) => {
  taskManager.complete(taskId);
  mainWindow?.webContents.send("task:update", taskManager.get(taskId));
});

ipcMain.on("jobs:gcodeFailed", (_e, taskId: string, error: string) => {
  taskManager.fail(taskId, error);
  mainWindow?.webContents.send("task:update", taskManager.get(taskId));
});
