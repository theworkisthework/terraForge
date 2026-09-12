import {
  discoverBitmapPlugins,
  type BitmapPluginRecord,
  type PluginDiscoveryError,
} from "./pluginManifest";

/** In-memory holder for the currently-discovered bitmap-renderer plugins. */
export class BitmapPluginRegistry {
  private plugins: BitmapPluginRecord[] = [];

  constructor(private readonly pluginsDir: string) {}

  async rescan(): Promise<{ plugins: BitmapPluginRecord[]; errors: PluginDiscoveryError[] }> {
    const { plugins, errors } = await discoverBitmapPlugins(this.pluginsDir);
    this.plugins = plugins;
    return { plugins, errors };
  }

  list(): BitmapPluginRecord[] {
    return this.plugins;
  }

  find(id: string): BitmapPluginRecord | undefined {
    return this.plugins.find((plugin) => plugin.manifest.id === id);
  }
}
