import { app } from "electron";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
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
import { registerFluidncIpcHandlers } from "./ipc/fluidnc";
import { registerFsIpcHandlers } from "./ipc/fs";
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
const connectionState = { type: null as "wifi" | "serial" | null };

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

registerFluidncIpcHandlers({
  fluidnc,
  serial,
  getConnectionType: () => connectionState.type,
  setConnectionType: (type) => {
    connectionState.type = type;
  },
  safeSend,
  taskManager,
});

registerFsIpcHandlers({
  getMainWindow,
  loadConfigs,
  saveConfigs,
});

// ─── IPC Handlers — Tasks ─────────────────────────────────────────────────────

registerTaskIpcHandlers(taskManager);

registerJobIpcHandlers(taskManager, safeSend);
