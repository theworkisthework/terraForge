import { ipcMain, shell } from "electron";
import type { PluginRenderContext, PluginRenderResult } from "../../types";
import { installExamplePlugins } from "../plugins/pluginPaths";
import type { RendererPluginRegistry } from "../plugins/pluginRegistry";
import type { PluginHostManager } from "../plugins/pluginHostManager";
import { PluginSourceMissingError } from "../plugins/pluginSourceCache";

export interface RendererPluginIpcOptions {
  pluginsDir: string;
  examplesDir: string;
  registry: RendererPluginRegistry;
  hostManager: PluginHostManager;
}

export function registerRendererPluginIpcHandlers({
  pluginsDir,
  examplesDir,
  registry,
  hostManager,
}: RendererPluginIpcOptions): void {
  ipcMain.handle("rendererPlugins:list", async () => {
    // Awaiting the first scan is what stops a startup-time list() from
    // returning empty while discovery is still in flight.
    await registry.ready();
    return {
      manifests: registry.list().map((plugin) => plugin.manifest),
      errors: registry.lastErrors(),
    };
  });

  ipcMain.handle("rendererPlugins:rescan", async () => {
    const { plugins, errors } = await registry.rescan();
    // A warm host holds the plugin's modules in memory, so without this an
    // edited plugin would keep rendering with its previous source until the
    // idle sweep happened to recycle it. Unchanged plugins are left running.
    hostManager.invalidateChanged();
    return { manifests: plugins.map((plugin) => plugin.manifest), errors };
  });

  ipcMain.handle(
    "rendererPlugins:render",
    async (_e, pluginId: string, context: PluginRenderContext): Promise<PluginRenderResult> => {
      try {
        return { status: "ok", output: await hostManager.render(pluginId, context) };
      } catch (err) {
        // An expected outcome, not a failure: the app window resends the
        // image with its pixels. A result, because an error loses its type
        // on the way across IPC.
        if (err instanceof PluginSourceMissingError) return { status: "source-missing" };
        throw err;
      }
    },
  );

  ipcMain.handle("rendererPlugins:installExamples", async () => {
    const result = await installExamplePlugins(examplesDir, pluginsDir);
    // Rescan here so the caller never has to remember to, and drop changed
    // hosts for the same reason a manual rescan does.
    const { plugins, errors } = await registry.rescan();
    hostManager.invalidateChanged();
    return { ...result, manifests: plugins.map((plugin) => plugin.manifest), errors };
  });

  ipcMain.handle("rendererPlugins:openFolder", async () => {
    // openPath resolves with an error string rather than rejecting, so an
    // unopenable folder would otherwise look like success to the caller.
    const failure = await shell.openPath(pluginsDir);
    if (failure) throw new Error(`Could not open the plugins folder: ${failure}`);
  });
}
