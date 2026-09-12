import { create } from "zustand";
import type { BitmapPluginManifest } from "../../../types";

interface BitmapPluginState {
  /** Metadata for every currently-installed bitmap renderer plugin, loaded once at startup. */
  plugins: BitmapPluginManifest[];
  setPlugins: (plugins: BitmapPluginManifest[]) => void;
  loadBitmapPlugins: () => Promise<void>;
}

export const useBitmapPluginStore = create<BitmapPluginState>((set) => ({
  plugins: [],

  setPlugins: (plugins) => set({ plugins }),

  loadBitmapPlugins: async () => {
    try {
      const plugins = await window.terraForge.bitmapPlugins.list();
      set({ plugins });
    } catch {
      set({ plugins: [] });
    }
  },
}));
