import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_INK_SERVICE_STATIONS,
  type InkServiceStation,
} from "../../../types";

interface AppConfigState {
  enablePerPathPasses: boolean;
  debugLoggingEnabled: boolean;
  showMachineCoordinates: boolean;
  vinylCuttingEnabled: boolean;
  vinylBladeOffsetMM: number;
  vinylCornerAngleThresholdDeg: number;
  vinylMicroJogMagnitudeMM: number;
  showInkServiceStationsOnCanvas: boolean;
  inkServiceStations: InkServiceStation[];
  setEnablePerPathPasses: (enabled: boolean) => void;
  setDebugLoggingEnabled: (enabled: boolean) => void;
  setShowMachineCoordinates: (enabled: boolean) => void;
  setVinylCuttingEnabled: (enabled: boolean) => void;
  setVinylBladeOffsetMM: (value: number) => void;
  setVinylCornerAngleThresholdDeg: (value: number) => void;
  setVinylMicroJogMagnitudeMM: (value: number) => void;
  setShowInkServiceStationsOnCanvas: (enabled: boolean) => void;
  setInkServiceStations: (stations: InkServiceStation[]) => void;
  updateInkServiceStation: (
    id: string,
    patch: Partial<InkServiceStation>,
  ) => void;
  addInkServiceStation: () => void;
  removeInkServiceStation: (id: string) => void;
}

export const useAppConfigStore = create<AppConfigState>()(
  persist(
    (set) => ({
      enablePerPathPasses: false,
      debugLoggingEnabled: false,
      showMachineCoordinates: false,
      vinylCuttingEnabled: false,
      vinylBladeOffsetMM: 0.25,
      vinylCornerAngleThresholdDeg: 10,
      vinylMicroJogMagnitudeMM: 0.02,
      showInkServiceStationsOnCanvas: true,
      inkServiceStations: structuredClone(DEFAULT_INK_SERVICE_STATIONS),
      setEnablePerPathPasses: (enabled) =>
        set({ enablePerPathPasses: enabled }),
      setDebugLoggingEnabled: (enabled) =>
        set({ debugLoggingEnabled: enabled }),
      setShowMachineCoordinates: (enabled) =>
        set({ showMachineCoordinates: enabled }),
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
      setInkServiceStations: (stations) =>
        set({
          inkServiceStations: stations.map((station) => ({
            ...station,
            dwellMs: Math.max(0, station.dwellMs),
          })),
        }),
      updateInkServiceStation: (id, patch) =>
        set((state) => ({
          inkServiceStations: state.inkServiceStations.map((station) =>
            station.id === id
              ? {
                  ...station,
                  ...patch,
                  dwellMs: Math.max(
                    0,
                    Number.isFinite(
                      (patch.dwellMs ?? station.dwellMs) as number,
                    )
                      ? ((patch.dwellMs ?? station.dwellMs) as number)
                      : station.dwellMs,
                  ),
                }
              : station,
          ),
        })),
      addInkServiceStation: () =>
        set((state) => {
          const nextIndex =
            state.inkServiceStations.filter((s) => s.type === "dip").length + 1;
          return {
            inkServiceStations: [
              ...state.inkServiceStations,
              {
                id: `dip-${Date.now()}`,
                name: `Dip ${nextIndex}`,
                type: "dip",
                x: 0,
                y: 0,
                dwellMs: 500,
                enabled: true,
              },
            ],
          };
        }),
      removeInkServiceStation: (id) =>
        set((state) => ({
          inkServiceStations: state.inkServiceStations.filter(
            (station) => station.id !== id,
          ),
        })),
    }),
    { name: "terraforge-app-config" },
  ),
);
