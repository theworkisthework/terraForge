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
  downloadFile: (taskId, remotePath, localPath, filesystem?) =>
    invoke<void>(
      "fluidnc:downloadFile",
      taskId,
      remotePath,
      localPath,
      filesystem,
    ),
  fetchFileText: (remotePath, filesystem?) =>
    invoke<string>("fluidnc:fetchFileText", remotePath, filesystem),
  deleteFile: (remotePath, source?) =>
    invoke<void>("fluidnc:deleteFile", remotePath, source),
  runFile: (remotePath, filesystem) =>
    invoke<void>("fluidnc:runFile", remotePath, filesystem),
  uploadGcode: (taskId, content, remotePath) =>
    invoke<void>("fluidnc:uploadGcode", taskId, content, remotePath),
  pauseJob: () => invoke<void>("fluidnc:pauseJob"),
  resumeJob: () => invoke<void>("fluidnc:resumeJob"),
  abortJob: () => invoke<void>("fluidnc:abortJob"),
  connectWebSocket: (host, port, wsPort) =>
    invoke<void>("fluidnc:connectWebSocket", host, port, wsPort),
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

  onPing: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("fluidnc:ping", listener);
    return () => ipcRenderer.off("fluidnc:ping", listener);
  },

  onFirmwareInfo: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, info: string | null) =>
      cb(info);
    ipcRenderer.on("fluidnc:firmware", listener);
    return () => ipcRenderer.off("fluidnc:firmware", listener);
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
  openPdfDialog: () => invoke<string | null>("fs:openPdfDialog"),
  openFileDialog: () => invoke<string | null>("fs:openFileDialog"),
  openGcodeDialog: () => invoke<string | null>("fs:openGcodeDialog"),
  openImportDialog: () => invoke<string | null>("fs:openImportDialog"),
  readFile: (filePath) => invoke<string>("fs:readFile", filePath),
  readFileBinary: (filePath) =>
    invoke<Uint8Array>("fs:readFileBinary", filePath),
  writeFile: (filePath, content) =>
    invoke<void>("fs:writeFile", filePath, content),
  saveGcodeDialog: (defaultName) =>
    invoke<string | null>("fs:saveGcodeDialog", defaultName),
  saveFileDialog: (defaultName) =>
    invoke<string | null>("fs:saveFileDialog", defaultName),
  saveLayoutDialog: (defaultName) =>
    invoke<string | null>("fs:saveLayoutDialog", defaultName),
  openLayoutDialog: () => invoke<string | null>("fs:openLayoutDialog"),

  onMenuImport: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:import", listener);
    return () => ipcRenderer.off("menu:import", listener);
  },
  onMenuOpenLayout: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:openLayout", listener);
    return () => ipcRenderer.off("menu:openLayout", listener);
  },
  onMenuSaveLayout: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:saveLayout", listener);
    return () => ipcRenderer.off("menu:saveLayout", listener);
  },
  onMenuCloseLayout: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:closeLayout", listener);
    return () => ipcRenderer.off("menu:closeLayout", listener);
  },
  setLayoutMenuState: (hasImports) =>
    ipcRenderer.send("menu:setLayoutMenuState", hasImports),

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
  exportConfigs: () => invoke<string | null>("config:exportConfigs"),
  importConfigs: () =>
    invoke<{ added: number; skipped: number }>("config:importConfigs"),
};

// ─── App API ─────────────────────────────────────────────────────────────────

const appApi: TerraForgeAPI["app"] = {
  getVersion: () => invoke<string>("app:getVersion"),
  openExternal: (url) => invoke<void>("app:openExternal", url),
  onMenuAbout: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:about", listener);
    return () => ipcRenderer.off("menu:about", listener);
  },
};

// ─── Edit API ─────────────────────────────────────────────────────────────────

const editApi: TerraForgeAPI["edit"] = {
  onMenuCopy: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:editCopy", listener);
    return () => ipcRenderer.off("menu:editCopy", listener);
  },
  onMenuCut: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:editCut", listener);
    return () => ipcRenderer.off("menu:editCut", listener);
  },
  onMenuPaste: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:editPaste", listener);
    return () => ipcRenderer.off("menu:editPaste", listener);
  },
  onMenuSelectAll: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("menu:editSelectAll", listener);
    return () => ipcRenderer.off("menu:editSelectAll", listener);
  },
  setHasSelection: (hasSelection) =>
    ipcRenderer.send("menu:setEditMenuState", hasSelection),
};

// ─── Expose to renderer ───────────────────────────────────────────────────────

const api: TerraForgeAPI = {
  fluidnc,
  serial,
  fs,
  tasks,
  jobs,
  config,
  app: appApi,
  edit: editApi,
};
contextBridge.exposeInMainWorld("terraForge", api);
