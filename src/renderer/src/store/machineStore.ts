import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { MachineConfig, MachineStatus } from "../../../types";

export interface SelectedJobFile {
  path: string;
  source: "fs" | "sd";
  name: string;
}

interface MachineState {
  configs: MachineConfig[];
  activeConfigId: string | null;
  status: MachineStatus | null;
  connected: boolean;
  wsLive: boolean;
  selectedJobFile: SelectedJobFile | null;

  setConfigs: (configs: MachineConfig[]) => void;
  setActiveConfigId: (id: string | null) => void;
  setStatus: (status: MachineStatus) => void;
  setConnected: (connected: boolean) => void;
  setWsLive: (live: boolean) => void;
  setSelectedJobFile: (file: SelectedJobFile | null) => void;
  activeConfig: () => MachineConfig | undefined;

  // CRUD helpers that also persist via IPC
  addConfig: (cfg: MachineConfig) => Promise<void>;
  updateConfig: (
    id: string,
    patch: Partial<Omit<MachineConfig, "id">>,
  ) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  setActiveConfig: (id: string) => void;
}

export const useMachineStore = create<MachineState>()(
  immer((set, get) => ({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,

    setConfigs: (configs) =>
      set((state) => {
        state.configs = configs;
        if (!state.activeConfigId && configs.length > 0) {
          state.activeConfigId = configs[0].id;
        }
      }),

    setActiveConfigId: (id) =>
      set((state) => {
        state.activeConfigId = id;
      }),

    setStatus: (status) =>
      set((state) => {
        state.status = status;
      }),

    setConnected: (connected) =>
      set((state) => {
        state.connected = connected;
        if (!connected) state.wsLive = false;
      }),

    setWsLive: (live) =>
      set((state) => {
        state.wsLive = live;
      }),

    setSelectedJobFile: (file) =>
      set((state) => {
        state.selectedJobFile = file;
      }),

    activeConfig: () => {
      const { configs, activeConfigId } = get();
      return configs.find((c) => c.id === activeConfigId);
    },

    addConfig: async (cfg) => {
      set((state) => {
        state.configs.push(cfg as MachineConfig);
      });
      await window.terraForge.config.saveMachineConfig(cfg);
    },

    updateConfig: async (id, patch) => {
      set((state) => {
        const idx = state.configs.findIndex((c) => c.id === id);
        if (idx !== -1) Object.assign(state.configs[idx], patch);
      });
      const updated = get().configs.find((c) => c.id === id);
      if (updated) await window.terraForge.config.saveMachineConfig(updated);
    },

    deleteConfig: async (id) => {
      set((state) => {
        state.configs = state.configs.filter((c) => c.id !== id);
        if (state.activeConfigId === id) {
          state.activeConfigId = state.configs[0]?.id ?? null;
        }
      });
      await window.terraForge.config.deleteMachineConfig(id);
    },

    setActiveConfig: (id) =>
      set((state) => {
        state.activeConfigId = id;
      }),
  })),
);
