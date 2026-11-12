import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setAsideLegacyInkServiceStations } from "../features/machine/utils/legacyInkServiceStations";

interface AppConfigState {
  enablePerPathPasses: boolean;
  debugLoggingEnabled: boolean;
  showConsoleTimestamps: boolean;
  showMachineCoordinates: boolean;
  respectSvgColorsOnCanvas: boolean;
  bitmapRendererEnabled: boolean;
  vinylCuttingEnabled: boolean;
  vinylBladeOffsetMM: number;
  vinylCornerAngleThresholdDeg: number;
  vinylMicroJogMagnitudeMM: number;
  showInkServiceStationsOnCanvas: boolean;
  setEnablePerPathPasses: (enabled: boolean) => void;
  setDebugLoggingEnabled: (enabled: boolean) => void;
  setShowConsoleTimestamps: (enabled: boolean) => void;
  setShowMachineCoordinates: (enabled: boolean) => void;
  setRespectSvgColorsOnCanvas: (enabled: boolean) => void;
  setBitmapRendererEnabled: (enabled: boolean) => void;
  setVinylCuttingEnabled: (enabled: boolean) => void;
  setVinylBladeOffsetMM: (value: number) => void;
  setVinylCornerAngleThresholdDeg: (value: number) => void;
  setVinylMicroJogMagnitudeMM: (value: number) => void;
  setShowInkServiceStationsOnCanvas: (enabled: boolean) => void;
}

export const useAppConfigStore = create<AppConfigState>()(
  persist(
    (set) => ({
      enablePerPathPasses: false,
      debugLoggingEnabled: false,
      showConsoleTimestamps: true,
      showMachineCoordinates: false,
      respectSvgColorsOnCanvas: false,
      bitmapRendererEnabled: true,
      vinylCuttingEnabled: false,
      vinylBladeOffsetMM: 0.25,
      vinylCornerAngleThresholdDeg: 10,
      vinylMicroJogMagnitudeMM: 0.02,
      showInkServiceStationsOnCanvas: false,
      setEnablePerPathPasses: (enabled) =>
        set({ enablePerPathPasses: enabled }),
      setDebugLoggingEnabled: (enabled) =>
        set({ debugLoggingEnabled: enabled }),
      setShowConsoleTimestamps: (enabled) =>
        set({ showConsoleTimestamps: enabled }),
      setShowMachineCoordinates: (enabled) =>
        set({ showMachineCoordinates: enabled }),
      setRespectSvgColorsOnCanvas: (enabled) =>
        set({ respectSvgColorsOnCanvas: enabled }),
      setBitmapRendererEnabled: (enabled) =>
        set({ bitmapRendererEnabled: enabled }),
      setVinylCuttingEnabled: (enabled) =>
        set({ vinylCuttingEnabled: enabled }),
      setVinylBladeOffsetMM: (value) =>
        set({ vinylBladeOffsetMM: Math.max(0, value) }),
      setVinylCornerAngleThresholdDeg: (value) =>
        set({ vinylCornerAngleThresholdDeg: Math.max(0, value) }),
      setVinylMicroJogMagnitudeMM: (value) =>
        set({ vinylMicroJogMagnitudeMM: Math.max(0, value) }),
      setShowInkServiceStationsOnCanvas: (enabled) =>
        set({ showInkServiceStationsOnCanvas: enabled }),
    }),
    {
      name: "terraforge-app-config",
      version: 1,
      // debugLoggingEnabled and showConsoleTimestamps are kept in
      // app-config.json by the main process, which also acts on them; the
      // app loads them from there at start-up (see useAppBootstrap). A
      // second copy here could only disagree with it.
      partialize: ({
        debugLoggingEnabled: _debug,
        showConsoleTimestamps: _timestamps,
        ...rest
      }): Partial<AppConfigState> => rest,
      migrate: (persisted, version) => {
        const state = { ...(persisted as Record<string, unknown>) };
        if (version < 1) {
          // Version 0 held one app-wide list of ink service stations. They
          // belong to each machine config now: set the list aside for the
          // configs to adopt once they have loaded.
          if ("inkServiceStations" in state) setAsideLegacyInkServiceStations(state.inkServiceStations);
          delete state.inkServiceStations;
          delete state.debugLoggingEnabled;
          delete state.showConsoleTimestamps;
        }
        return state as Partial<AppConfigState>;
      },
    },
  ),
);
