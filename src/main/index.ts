import { app } from "electron";
import { join } from "path";
import { registerAppLifecycleHandlers } from "./bootstrap/lifecycle";
import { createMainWindow, getMainWindow, safeSend } from "./bootstrap/window";
import {
  buildApplicationMenu,
  registerMenuStateHandlers,
} from "./menu/applicationMenu";
import { createPersistence, BUILT_IN_PAGE_SIZES } from "./config";
import { registerPushEventForwarders } from "./events";
import {
  registerAppIpcHandlers,
  registerConfigIpcHandlers,
  registerJobIpcHandlers,
  registerTaskIpcHandlers,
  registerFluidncIpcHandlers,
  registerFsIpcHandlers,
  registerRendererPluginIpcHandlers,
} from "./ipc";
import { FluidNCClient } from "../machine/fluidnc";
import { SerialClient } from "../machine/serial";
import { TaskManager } from "../tasks/taskManager";
import { resolveRendererPluginsDir, resolveBundledExamplesDir } from "./plugins/pluginPaths";
import { RendererPluginRegistry } from "./plugins/pluginRegistry";
import { PluginHostManager } from "./plugins/pluginHostManager";
import { registerPluginScheme } from "./plugins/pluginSandbox";

// Must run before the app's `ready` event: Electron only accepts privileged
// scheme registration that early, and the sandboxed plugin host pages are
// served over it.
registerPluginScheme();

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
    rendererPluginHostManager.terminateAll();
  },
  onAllAppWindowsClosed: () => rendererPluginHostManager.terminateAll(),
});

// ─── Singletons ───────────────────────────────────────────────────────────────

const fluidnc = new FluidNCClient();
const serial = new SerialClient();
const taskManager = new TaskManager();
const persistence = createPersistence(app.getPath("userData"));
const rendererPluginsDir = resolveRendererPluginsDir(app.getPath("userData"));
const rendererPluginRegistry = new RendererPluginRegistry(rendererPluginsDir);
const rendererPluginHostManager = new PluginHostManager(
  join(__dirname, "../preload/pluginSandboxPreload.js"),
  rendererPluginRegistry,
);

// Tracks which transport is currently active so IPC handlers can route correctly.
const connectionState = { type: null as "wifi" | "serial" | null };

// ─── Push events to renderer ──────────────────────────────────────────────────
registerPushEventForwarders({
  taskManager,
  fluidnc,
  serial,
  safeSend,
});

registerConfigIpcHandlers({
  getMainWindow,
  loadConfigs: persistence.loadConfigs,
  saveConfigs: persistence.saveConfigs,
  loadPageSizes: persistence.loadPageSizes,
  loadAppConfig: persistence.loadAppConfig,
  saveAppConfig: persistence.saveAppConfig,
  onAppConfigSaved: (config) => {
    fluidnc.setDebugLoggingEnabled(config.debugLoggingEnabled);
  },
  pageSizesPath: persistence.pageSizesPath,
  builtInPageSizes: BUILT_IN_PAGE_SIZES,
});

void persistence
  .loadAppConfig()
  .then((config) => {
    fluidnc.setDebugLoggingEnabled(config.debugLoggingEnabled);
  })
  .catch(() => {
    fluidnc.setDebugLoggingEnabled(false);
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
  loadConfigs: persistence.loadConfigs,
  saveConfigs: persistence.saveConfigs,
});

// ─── IPC Handlers — Tasks ─────────────────────────────────────────────────────

registerTaskIpcHandlers(taskManager);

registerJobIpcHandlers(taskManager, safeSend);

// ─── IPC Handlers — Renderer plugins ───────────────────────────────────

registerRendererPluginIpcHandlers({
  pluginsDir: rendererPluginsDir,
  examplesDir: resolveBundledExamplesDir(__dirname),
  registry: rendererPluginRegistry,
  hostManager: rendererPluginHostManager,
});

void rendererPluginRegistry.ready();
