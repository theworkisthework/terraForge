import { ipcMain, shell } from "electron";
import type { BitmapLuminance, BitmapRendererSettings } from "../../types";
import type { BitmapPluginRegistry } from "../plugins/pluginRegistry";
import type { PluginHostManager } from "../plugins/pluginHostManager";

export interface BitmapPluginIpcOptions {
  pluginsDir: string;
  registry: BitmapPluginRegistry;
  hostManager: PluginHostManager;
}

export function registerBitmapPluginIpcHandlers({
  pluginsDir,
  registry,
  hostManager,
}: BitmapPluginIpcOptions): void {
  ipcMain.handle("bitmapPlugins:list", async () => {
    // Awaiting the first scan is what stops a startup-time list() from
    // returning empty while discovery is still in flight.
    await registry.ready();
    return {
      manifests: registry.list().map((plugin) => plugin.manifest),
      errors: registry.lastErrors(),
    };
  });

  ipcMain.handle("bitmapPlugins:rescan", async () => {
    const { plugins, errors } = await registry.rescan();
    // A warm host holds the plugin's modules in memory, so without this an
    // edited plugin would keep rendering with its previous source until the
    // idle sweep happened to recycle it.
    hostManager.invalidateAll();
    return { manifests: plugins.map((plugin) => plugin.manifest), errors };
  });

  ipcMain.handle(
    "bitmapPlugins:render",
    (
      _e,
      pluginId: string,
      luminance: BitmapLuminance,
      settings: BitmapRendererSettings,
      baseScale: number,
    ) => hostManager.render(pluginId, luminance, settings, baseScale),
  );

  ipcMain.handle("bitmapPlugins:openFolder", async () => {
    // openPath resolves with an error string rather than rejecting, so an
    // unopenable folder would otherwise look like success to the caller.
    const failure = await shell.openPath(pluginsDir);
    if (failure) throw new Error(`Could not open the plugins folder: ${failure}`);
  });
}
