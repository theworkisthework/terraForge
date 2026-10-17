/**
 * Preload for a sandboxed bitmap-plugin host window. Runs with
 * `sandbox: true`, so it has no Node API beyond Electron's own IPC bridge,
 * and exposes exactly two functions to the page: send a message, receive a
 * message. Nothing else crosses into the page's world.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__terraForgePluginHost", {
  onMessage: (callback: (message: unknown) => void) => {
    ipcRenderer.on("plugin-host:to-page", (_event, message) => callback(message));
  },
  send: (message: unknown) => ipcRenderer.send("plugin-host:from-page", message),
});
