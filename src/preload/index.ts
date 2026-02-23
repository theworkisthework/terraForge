import { contextBridge, ipcRenderer } from "electron";
import type {
  TerraForgeAPI,
  MachineConfig,
  MachineStatus,
  RemoteFile,
  BackgroundTask,
  VectorObject,
  GcodeOptions,
} from "../types";

// ─── Utility: create a typed IPC invoker ─────────────────────────────────────

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

// ─── FluidNC API ─────────────────────────────────────────────────────────────

const fluidnc: TerraForgeAPI["fluidnc"] = {
  getStatus: () => invoke<MachineStatus>("fluidnc:getStatus"),
  sendCommand: (cmd) => invoke<string>("fluidnc:sendCommand", cmd),
  listFiles: (path) => invoke<RemoteFile[]>("fluidnc:listFiles", path),
  listSDFiles: (path) => invoke<RemoteFile[]>("fluidnc:listSDFiles", path),
  uploadFile: (taskId, localPath, remotePath) =>
    invoke<void>("fluidnc:uploadFile", taskId, localPath, remotePath),
  downloadFile: (taskId, remotePath, localPath) =>
    invoke<void>("fluidnc:downloadFile", taskId, remotePath, localPath),
  deleteFile: (remotePath) => invoke<void>("fluidnc:deleteFile", remotePath),
  runFile: (remotePath, filesystem) => invoke<void>("fluidnc:runFile", remotePath, filesystem),
  pauseJob: () => invoke<void>("fluidnc:pauseJob"),
  resumeJob: () => invoke<void>("fluidnc:resumeJob"),
  abortJob: () => invoke<void>("fluidnc:abortJob"),
  connectWebSocket: (host, port) =>
    invoke<void>("fluidnc:connectWebSocket", host, port),
  disconnectWebSocket: () => invoke<void>("fluidnc:disconnectWebSocket"),

  onStatusUpdate: (cb) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: MachineStatus,
    ) => cb(status);
    ipcRenderer.on("fluidnc:status", listener);
    return () => ipcRenderer.off("fluidnc:status", listener);
  },

  onConsoleMessage: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) =>
      cb(message);
    ipcRenderer.on("fluidnc:console", listener);
    return () => ipcRenderer.off("fluidnc:console", listener);
  },
};

// ─── Serial API ───────────────────────────────────────────────────────────────

const serial: TerraForgeAPI["serial"] = {
  listPorts: () => invoke<string[]>("serial:listPorts"),
  connect: (path, baudRate) => invoke<void>("serial:connect", path, baudRate),
  disconnect: () => invoke<void>("serial:disconnect"),
  send: (data) => invoke<void>("serial:send", data),

  onData: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) =>
      cb(data);
    ipcRenderer.on("serial:data", listener);
    return () => ipcRenderer.off("serial:data", listener);
  },
};

// ─── File-System API ─────────────────────────────────────────────────────────

const fs: TerraForgeAPI["fs"] = {
  openSvgDialog: () => invoke<string | null>("fs:openSvgDialog"),
  readFile: (filePath) => invoke<string>("fs:readFile", filePath),
  writeFile: (filePath, content) =>
    invoke<void>("fs:writeFile", filePath, content),
  saveGcodeDialog: (defaultName) =>
    invoke<string | null>("fs:saveGcodeDialog", defaultName),
  loadConfigs: () => invoke<MachineConfig[]>("fs:loadConfigs"),
  saveConfigs: (configs) => invoke<void>("fs:saveConfigs", configs),
};

// ─── Tasks API ───────────────────────────────────────────────────────────────

const tasks: TerraForgeAPI["tasks"] = {
  cancel: (taskId) => invoke<void>("tasks:cancel", taskId),

  onTaskUpdate: (cb) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      task: BackgroundTask,
    ) => cb(task);
    ipcRenderer.on("task:update", listener);
    return () => ipcRenderer.off("task:update", listener);
  },
};

// ─── Jobs API ────────────────────────────────────────────────────────────────

const jobs: TerraForgeAPI["jobs"] = {
  generateGcode: (taskId, objects, config, options) =>
    invoke<string>("jobs:generateGcode", taskId, objects, config, options),
};

// ─── Config API ──────────────────────────────────────────────────────────────

const config: TerraForgeAPI["config"] = {
  getMachineConfigs: () => invoke<MachineConfig[]>("config:getMachineConfigs"),
  saveMachineConfig: (cfg) => invoke<void>("config:saveMachineConfig", cfg),
  deleteMachineConfig: (id) => invoke<void>("config:deleteMachineConfig", id),
};

// ─── Expose to renderer ───────────────────────────────────────────────────────

const api: TerraForgeAPI = { fluidnc, serial, fs, tasks, jobs, config };
contextBridge.exposeInMainWorld("terraForge", api);
