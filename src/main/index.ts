import { app, dialog } from "electron";
import { basename, join } from "path";
import { registerAppLifecycleHandlers } from "./bootstrap/lifecycle";
import { createMainWindow, getMainWindow, safeSend } from "./bootstrap/window";
import { confirmQuit, guardWindowClose, registerUnsavedChangesHandlers } from "./bootstrap/unsavedChanges";
import { registerUnexpectedErrorHandlers } from "./bootstrap/unexpectedErrors";
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

// First, so that a failure in anything below is reported.
registerUnexpectedErrorHandlers({
  safeSend,
  windowCanShow: () => {
    const win = getMainWindow();
    // A window still loading has nothing listening yet.
    return !!win && !win.isDestroyed() && !win.webContents.isDestroyed() && !win.webContents.isLoading();
  },
});

// Must run before the app's `ready` event: Electron only accepts privileged
// scheme registration that early, and the sandboxed plugin host pages are
// served over it.
registerPluginScheme();

registerMenuStateHandlers();
registerUnsavedChangesHandlers();

registerAppLifecycleHandlers({
  // Closing the window, or quitting, asks first if the layout has unsaved changes.
  createMainWindow: () => guardWindowClose(createMainWindow()),
  confirmQuit: () => confirmQuit(getMainWindow()),
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
const persistence = createPersistence(app.getPath("userData"), {
  // A settings file that cannot be parsed is moved aside and defaults are
  // used in its place. Say so: otherwise the user finds their machines gone
  // with no hint that the old file is still there to recover from.
  onCorruptFile: ({ path, backupPath }) => {
    void app.whenReady().then(() =>
      dialog.showMessageBox({
        type: "warning",
        title: "Settings file could not be read",
        message: `${basename(path)} is damaged and could not be read.`,
        detail: backupPath
          ? `Default settings are in use. The damaged file was kept as:\n${backupPath}`
          : "Default settings are in use. The damaged file could not be backed up and will be replaced the next time settings are saved.",
      }),
    );
  },
});
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
  updateConfigs: persistence.updateConfigs,
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
