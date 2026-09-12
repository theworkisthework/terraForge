/**
 * Runs INSIDE an isolated Electron utilityProcess — one per installed bitmap
 * renderer plugin. Owns the entire wire protocol so a plugin author's own
 * module only ever has to export `render(luminance, settings, baseScale)`;
 * it never needs to know this process/IPC machinery exists.
 *
 * Bundled as its own build entry (see electron.vite.config.mjs) and shipped
 * outside app.asar (see the "build.asarUnpack" entry in package.json) —
 * utilityProcess.fork() resolves its target through Node's ESM loader, which
 * does not understand Electron's asar virtual paths, so this script must be a
 * real filesystem path at runtime. Verified against a hand-packed asar during
 * design; see the plan for details.
 */
import type { BitmapLuminance, BitmapRendererSettings } from "../../types";

interface BitmapRendererPluginModule {
  render: (
    luminance: BitmapLuminance,
    settings: BitmapRendererSettings,
    baseScale: number,
  ) => string | Promise<string>;
}

type InitMessage = { type: "init"; entryPath: string };
type RenderMessage = {
  type: "render";
  reqId: string;
  luminance: BitmapLuminance;
  settings: BitmapRendererSettings;
  baseScale: number;
};
type HostMessage = InitMessage | RenderMessage;

let plugin: BitmapRendererPluginModule | null = null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

process.parentPort.on("message", async (event) => {
  const message = event.data as HostMessage;

  if (message.type === "init") {
    try {
      plugin = require(message.entryPath) as BitmapRendererPluginModule;
      process.parentPort.postMessage({ type: "ready" });
    } catch (err) {
      process.parentPort.postMessage({ type: "load-error", message: errorMessage(err) });
    }
    return;
  }

  if (message.type === "render") {
    const { reqId, luminance, settings, baseScale } = message;
    try {
      if (!plugin || typeof plugin.render !== "function") {
        throw new Error("Plugin module has no render() export.");
      }
      const path = await plugin.render(luminance, settings, baseScale);
      process.parentPort.postMessage({ type: "result", reqId, path });
    } catch (err) {
      process.parentPort.postMessage({ type: "error", reqId, message: errorMessage(err) });
    }
  }
});

// A bad plugin throwing outside the render() call itself (e.g. during a
// dangling timer it created) should still surface as a diagnosable message
// instead of the process dying with no explanation to the host.
process.on("uncaughtException", (err) => {
  process.parentPort.postMessage({ type: "fatal", message: errorMessage(err) });
});
process.on("unhandledRejection", (err) => {
  process.parentPort.postMessage({ type: "fatal", message: errorMessage(err) });
});
