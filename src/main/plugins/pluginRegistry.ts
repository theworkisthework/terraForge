import {
  discoverBitmapPlugins,
  type BitmapPluginRecord,
  type PluginDiscoveryError,
} from "./pluginManifest";

export interface PluginScanResult {
  plugins: BitmapPluginRecord[];
  errors: PluginDiscoveryError[];
}

/** In-memory holder for the currently-discovered bitmap-renderer plugins. */
export class BitmapPluginRegistry {
  private plugins: BitmapPluginRecord[] = [];
  private errors: PluginDiscoveryError[] = [];
  private firstScan: Promise<void> | null = null;

  constructor(private readonly pluginsDir: string) {}

  /**
   * Resolves once the first scan has completed, starting it if nothing has
   * yet. Reads go through this so a renderer asking for the plugin list while
   * the app is still starting cannot be handed an empty list simply because
   * the initial scan had not landed — it would have no reason to ask again.
   */
  ready(): Promise<void> {
    this.firstScan ??= this.rescan().then(() => undefined);
    return this.firstScan;
  }

  async rescan(): Promise<PluginScanResult> {
    const { plugins, errors } = await discoverBitmapPlugins(this.pluginsDir);
    this.plugins = plugins;
    this.errors = errors;
    // An explicit rescan satisfies anything still waiting on the first one.
    this.firstScan ??= Promise.resolve();
    return { plugins, errors };
  }

  list(): BitmapPluginRecord[] {
    return this.plugins;
  }

  /** Per-folder reasons a plugin was rejected by the most recent scan. */
  lastErrors(): PluginDiscoveryError[] {
    return this.errors;
  }

  find(id: string): BitmapPluginRecord | undefined {
    return this.plugins.find((plugin) => plugin.manifest.id === id);
  }
}
