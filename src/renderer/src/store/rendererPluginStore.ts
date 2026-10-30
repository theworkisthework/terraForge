import { create } from "zustand";
import type { RendererPluginDiscoveryError, RendererPluginManifest } from "../../../types";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface RendererPluginState {
  /** Metadata for every currently-installed renderer plugin. */
  plugins: RendererPluginManifest[];
  /**
   * Per-folder reasons a plugin was rejected by the last scan. Surfaced in the
   * properties panel — a rejected plugin is otherwise indistinguishable from
   * one that was never installed, which makes a typo in a manifest almost
   * impossible to diagnose.
   */
  errors: RendererPluginDiscoveryError[];
  scanning: boolean;
  /** Set when a rescan or folder-open failed outright, as opposed to a plugin being rejected. */
  actionError: string | null;
  setPlugins: (plugins: RendererPluginManifest[]) => void;
  loadRendererPlugins: () => Promise<void>;
  rescanRendererPlugins: () => Promise<void>;
  openPluginsFolder: () => Promise<void>;
  installExamplePlugins: () => Promise<void>;
  /** What the last example install did, for a one-off confirmation message. */
  lastInstall: { installed: string[]; skipped: string[]; unsupported: string[] } | null;
}

export const useRendererPluginStore = create<RendererPluginState>((set) => ({
  plugins: [],
  errors: [],
  scanning: false,
  actionError: null,
  lastInstall: null,

  setPlugins: (plugins) => set({ plugins }),

  loadRendererPlugins: async () => {
    try {
      const { manifests, errors } = await window.terraForge.rendererPlugins.list();
      set({ plugins: manifests, errors, actionError: null });
    } catch (err) {
      set({ plugins: [], errors: [], actionError: describe(err) });
    }
  },

  rescanRendererPlugins: async () => {
    set({ scanning: true, actionError: null });
    try {
      const { manifests, errors } = await window.terraForge.rendererPlugins.rescan();
      set({ plugins: manifests, errors, scanning: false });
    } catch (err) {
      set({ scanning: false, actionError: describe(err) });
    }
  },

  installExamplePlugins: async () => {
    set({ scanning: true, actionError: null, lastInstall: null });
    try {
      const { manifests, errors, installed, skipped, unsupported } =
        await window.terraForge.rendererPlugins.installExamples();
      set({
        plugins: manifests,
        errors,
        scanning: false,
        lastInstall: { installed, skipped, unsupported },
      });
    } catch (err) {
      set({ scanning: false, actionError: describe(err) });
    }
  },

  openPluginsFolder: async () => {
    set({ actionError: null });
    try {
      await window.terraForge.rendererPlugins.openFolder();
    } catch (err) {
      set({ actionError: describe(err) });
    }
  },
}));
