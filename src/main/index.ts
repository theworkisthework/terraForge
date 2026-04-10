import { app } from "electron";
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
} from "./ipc";
import { FluidNCClient } from "../machine/fluidnc";
import { SerialClient } from "../machine/serial";
import { TaskManager } from "../tasks/taskManager";

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
const persistence = createPersistence(app.getPath("userData"));

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
  pageSizesPath: persistence.pageSizesPath,
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
  loadConfigs: persistence.loadConfigs,
  saveConfigs: persistence.saveConfigs,
});

// ─── IPC Handlers — Tasks ─────────────────────────────────────────────────────

registerTaskIpcHandlers(taskManager);

registerJobIpcHandlers(taskManager, safeSend);
