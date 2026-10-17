import { create } from "zustand";
import type { BitmapPluginDiscoveryError, BitmapPluginManifest } from "../../../types";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface BitmapPluginState {
  /** Metadata for every currently-installed bitmap renderer plugin. */
  plugins: BitmapPluginManifest[];
  /**
   * Per-folder reasons a plugin was rejected by the last scan. Surfaced in the
   * properties panel — a rejected plugin is otherwise indistinguishable from
   * one that was never installed, which makes a typo in a manifest almost
   * impossible to diagnose.
   */
  errors: BitmapPluginDiscoveryError[];
  scanning: boolean;
  /** Set when a rescan or folder-open failed outright, as opposed to a plugin being rejected. */
  actionError: string | null;
  setPlugins: (plugins: BitmapPluginManifest[]) => void;
  loadBitmapPlugins: () => Promise<void>;
  rescanBitmapPlugins: () => Promise<void>;
  openPluginsFolder: () => Promise<void>;
  installExamplePlugins: () => Promise<void>;
  /** What the last example install did, for a one-off confirmation message. */
  lastInstall: { installed: string[]; skipped: string[]; unsupported: string[] } | null;
}

export const useBitmapPluginStore = create<BitmapPluginState>((set) => ({
  plugins: [],
  errors: [],
  scanning: false,
  actionError: null,
  lastInstall: null,

  setPlugins: (plugins) => set({ plugins }),

  loadBitmapPlugins: async () => {
    try {
      const { manifests, errors } = await window.terraForge.bitmapPlugins.list();
      set({ plugins: manifests, errors, actionError: null });
    } catch (err) {
      set({ plugins: [], errors: [], actionError: describe(err) });
    }
  },

  rescanBitmapPlugins: async () => {
    set({ scanning: true, actionError: null });
    try {
      const { manifests, errors } = await window.terraForge.bitmapPlugins.rescan();
      set({ plugins: manifests, errors, scanning: false });
    } catch (err) {
      set({ scanning: false, actionError: describe(err) });
    }
  },

  installExamplePlugins: async () => {
    set({ scanning: true, actionError: null, lastInstall: null });
    try {
      const { manifests, errors, installed, skipped, unsupported } =
        await window.terraForge.bitmapPlugins.installExamples();
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
      await window.terraForge.bitmapPlugins.openFolder();
    } catch (err) {
      set({ actionError: describe(err) });
    }
  },
}));
