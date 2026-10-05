import { Browser } from "@capacitor/browser";
import type {
  AppConfig,
  BackgroundTask,
  MachineConfig,
  TerraForgeAPI,
} from "../types";
import { TaskManager } from "../tasks/taskManager";
import { Emitter } from "./emitter";
import { WebFluidNCClient } from "./fluidncWeb";
import {
  SAVE_DIR,
  exportFile,
  pickers,
  readPickedBytes,
  readPickedText,
  writeVirtual,
} from "./files";
import * as store from "./persistence";

// Mobile implementation of the `window.terraForge` contract that Electron's
// preload normally provides. Everything the main process did (REST/WebSocket
// to FluidNC, config persistence, file dialogs, task tracking) runs here in
// the WebView instead.

declare const __APP_VERSION__: string;

type MenuAction =
  | "import"
  | "openLayout"
  | "saveLayout"
  | "closeLayout"
  | "about"
  | "copy"
  | "cut"
  | "paste"
  | "selectAll";

/** Mobile UI uses this to trigger what the desktop app does via native menus. */
export const menuBus = new Emitter<Record<MenuAction, []>>();
/** Mirrors the desktop "layout has imports / has selection" menu enable state. */
export const menuState = new Emitter<{
  layout: [boolean];
  selection: [boolean];
}>();

const SERIAL_UNSUPPORTED =
  "USB serial is not available in the mobile app — use a Wi-Fi connection.";

export function createMobileApi(): TerraForgeAPI {
  const tasks = new TaskManager();
  const client = new WebFluidNCClient();
  const taskEvents = new Emitter<{ update: [BackgroundTask] }>();
  tasks.on("task-update", (t: BackgroundTask) => taskEvents.emit("update", t));

  const pushTask = (id: string) => {
    const t = tasks.get(id);
    if (t) taskEvents.emit("update", { ...t });
  };

  const controllers = new Map<string, AbortController>();

  /** Shared task lifecycle for uploads/downloads (mirrors main/ipc/fluidnc.ts). */
  async function runTransfer(
    taskId: string,
    type: "file-upload" | "file-download",
    label: string,
    work: (
      signal: AbortSignal,
      progress: (p: number) => void,
    ) => Promise<void>,
    rethrow: boolean,
  ) {
    const ac = new AbortController();
    controllers.set(taskId, ac);
    tasks.registerCancelHandler(taskId, () => ac.abort());
    tasks.create(taskId, type, label);
    try {
      await work(ac.signal, (progress) => {
        tasks.update(taskId, { progress });
        pushTask(taskId);
      });
      if (!tasks.isCancelled(taskId)) tasks.complete(taskId);
      pushTask(taskId);
    } catch (err) {
      if (!tasks.isCancelled(taskId)) {
        tasks.fail(taskId, String(err));
        pushTask(taskId);
        if (rethrow) throw err;
      }
    } finally {
      tasks.clearCancelHandler(taskId);
      controllers.delete(taskId);
    }
  }

  const fluidnc: TerraForgeAPI["fluidnc"] = {
    getStatus: () => client.getStatus(),
    sendCommand: (cmd) => client.sendCommand(cmd),
    listFiles: (p) => client.listFiles(p),
    listSDFiles: (p) => client.listSDFiles(p),
    fetchFileText: (p, fs) => client.fetchFileText(p, fs),
    deleteFile: (p, src) => client.deleteFile(p, src),
    runFile: (p, fs) => client.runFile(p, fs),
    pauseJob: () => client.pauseJob(),
    resumeJob: () => client.resumeJob(),
    abortJob: () => client.abortJob(),
    connectWebSocket: (host, port, wsPort) =>
      client.connectWebSocket(host, port, wsPort),
    disconnectWebSocket: async () => client.disconnectWebSocket(),

    uploadGcode: (taskId, content, remotePath) => {
      const name = remotePath.split(/[\\/]/).pop()!;
      return runTransfer(
        taskId,
        "file-upload",
        `Uploading ${name}`,
        (signal, progress) =>
          client.uploadData(content, remotePath, name, progress, signal),
        true,
      );
    },

    uploadFile: (taskId, localPath, remotePath) =>
      runTransfer(
        taskId,
        "file-upload",
        `Uploading ${remotePath}`,
        async (signal, progress) => {
          const bytes = await readPickedBytes(localPath);
          const fallback = localPath.split(/[\\/]/).pop()!;
          await client.uploadData(bytes, remotePath, fallback, progress, signal);
        },
        false,
      ),

    downloadFile: (taskId, remotePath, localPath, filesystem) =>
      runTransfer(
        taskId,
        "file-download",
        `Downloading ${remotePath}`,
        async (signal, progress) => {
          const bytes = await client.downloadBytes(
            remotePath,
            filesystem,
            progress,
            signal,
          );
          await exportFile(localPath, bytes);
        },
        false,
      ),

    onStatusUpdate: (cb) => client.on("status", cb),
    onConsoleMessage: (cb) => client.on("console", cb),
    onPing: (cb) => client.on("ping", cb),
    onFirmwareInfo: (cb) => client.on("firmware", cb),
  };

  const serial: TerraForgeAPI["serial"] = {
    listPorts: async () => [],
    connect: () => Promise.reject(new Error(SERIAL_UNSUPPORTED)),
    disconnect: async () => {},
    send: () => Promise.reject(new Error(SERIAL_UNSUPPORTED)),
    onData: () => () => {},
  };

  const fs: TerraForgeAPI["fs"] = {
    openSvgDialog: pickers.svg,
    openPdfDialog: pickers.pdf,
    openFileDialog: pickers.any,
    openGcodeDialog: pickers.gcode,
    openImportDialog: pickers.import,
    openLayoutDialog: pickers.layout,
    readFile: readPickedText,
    readFileBinary: readPickedBytes,
    writeFile: writeVirtual,
    saveGcodeDialog: async (name) => `${SAVE_DIR}/${name}`,
    saveFileDialog: async (name) => `${SAVE_DIR}/${name}`,
    saveLayoutDialog: async (name) => `${SAVE_DIR}/${name}`,
    chooseDirectory: async () => SAVE_DIR,
    onMenuImport: (cb) => menuBus.on("import", cb),
    onMenuOpenLayout: (cb) => menuBus.on("openLayout", cb),
    onMenuSaveLayout: (cb) => menuBus.on("saveLayout", cb),
    onMenuCloseLayout: (cb) => menuBus.on("closeLayout", cb),
    setLayoutMenuState: (has) => menuState.emit("layout", has),
    loadConfigs: store.loadConfigs,
    saveConfigs: store.saveConfigs,
  };

  const tasksApi: TerraForgeAPI["tasks"] = {
    cancel: async (id) => tasks.cancel(id),
    onTaskUpdate: (cb) => taskEvents.on("update", cb),
  };

  const jobs: TerraForgeAPI["jobs"] = {
    // G-code generation runs in a renderer Web Worker; this only registers
    // the task so progress toasts work, same as the desktop IPC handler.
    generateGcode: async (taskId) => {
      tasks.create(taskId, "gcode-generate", "Generating G-code");
      return "delegated";
    },
  };

  const config: TerraForgeAPI["config"] = {
    getMachineConfigs: store.loadConfigs,
    saveMachineConfig: async (cfg: MachineConfig) => {
      const configs = await store.loadConfigs();
      const idx = configs.findIndex((c) => c.id === cfg.id);
      if (idx >= 0) configs[idx] = cfg;
      else configs.push(cfg);
      await store.saveConfigs(configs);
    },
    deleteMachineConfig: async (id) => {
      const configs = await store.loadConfigs();
      await store.saveConfigs(configs.filter((c) => c.id !== id));
    },
    getAppConfig: store.loadAppConfig,
    saveAppConfig: async (cfg: AppConfig) => {
      await store.saveAppConfig(cfg);
      client.setDebugLoggingEnabled(cfg.debugLoggingEnabled);
    },
    exportConfigs: async () => {
      const configs = await store.loadConfigs();
      const payload = JSON.stringify(
        { terraForge: "machine-configs", version: 1, configs },
        null,
        2,
      );
      await exportFile(`${SAVE_DIR}/terraforge-machine-configs.json`, payload);
      return `${SAVE_DIR}/terraforge-machine-configs.json`;
    },
    importConfigs: async () => {
      const path = await pickers.json();
      if (!path) return { added: 0, skipped: 0 };
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readPickedText(path));
      } catch {
        throw new Error("Not a valid JSON file.");
      }
      const incoming: MachineConfig[] = Array.isArray(parsed)
        ? (parsed as MachineConfig[])
        : parsed && typeof parsed === "object" && "configs" in parsed
          ? (parsed as { configs: MachineConfig[] }).configs
          : (() => {
              throw new Error(
                "File does not contain a valid terraForge machine config export.",
              );
            })();
      const required: (keyof MachineConfig)[] = [
        "name",
        "bedWidth",
        "bedHeight",
        "connection",
      ];
      for (const c of incoming) {
        if (!c || typeof c !== "object")
          throw new Error("Invalid config entry in import file.");
        for (const k of required)
          if (!(k in c))
            throw new Error(`Config entry missing required field: "${k}".`);
      }
      const existing = await store.loadConfigs();
      const ids = new Set(existing.map((c) => c.id));
      const names = new Set(existing.map((c) => c.name.toLowerCase().trim()));
      const toAdd: MachineConfig[] = [];
      let skipped = 0;
      for (const c of incoming) {
        const nameKey = (c.name ?? "").toLowerCase().trim();
        if (ids.has(c.id) || names.has(nameKey)) skipped++;
        else {
          toAdd.push(c);
          ids.add(c.id);
          names.add(nameKey);
        }
      }
      if (toAdd.length) await store.saveConfigs([...existing, ...toAdd]);
      return { added: toAdd.length, skipped };
    },
    loadPageSizes: store.loadPageSizes,
    // Page sizes are edited on desktop by opening a JSON file; not offered on mobile.
    openPageSizesFile: async () => {},
  };

  const app: TerraForgeAPI["app"] = {
    getVersion: async () => __APP_VERSION__,
    openExternal: (url) => Browser.open({ url }),
    onMenuAbout: (cb) => menuBus.on("about", cb),
  };

  const edit: TerraForgeAPI["edit"] = {
    onMenuCopy: (cb) => menuBus.on("copy", cb),
    onMenuCut: (cb) => menuBus.on("cut", cb),
    onMenuPaste: (cb) => menuBus.on("paste", cb),
    onMenuSelectAll: (cb) => menuBus.on("selectAll", cb),
    setHasSelection: (has) => menuState.emit("selection", has),
  };

  return { fluidnc, serial, fs, tasks: tasksApi, jobs, config, app, edit };
}

export function installMobileApi(): void {
  window.terraForge = createMobileApi();
  window.terraForgeMobile = {
    triggerMenu: (action) => menuBus.emit(action),
    onLayoutState: (cb) => menuState.on("layout", cb),
  };
}
