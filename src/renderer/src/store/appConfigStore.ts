import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_INK_SERVICE_STATIONS,
  type InkServiceStationAction,
  type InkServiceStationType,
  type InkServiceStation,
} from "../../../types";

function defaultActionForType(
  type: InkServiceStationType,
): InkServiceStationAction | undefined {
  if (type === "prime") {
    return {
      kind: "prime-press",
      zDepthMM: 1,
      pressCount: 3,
    };
  }
  if (type === "dip" || type === "wash") {
    return {
      kind: "brush-motion",
      zDepthMM: 2,
      pattern: type === "wash" ? "circular" : "back-forth",
      repetitions: 3,
      distanceMM: 2,
    };
  }
  return undefined;
}

function normalizeStation(station: InkServiceStation): InkServiceStation {
  const dwellMs = Math.max(0, Number(station.dwellMs) || 0);
  const baseAction = defaultActionForType(station.type);
  let action = station.action;

  if (station.type === "prime") {
    if (!action || action.kind !== "prime-press") {
      action = baseAction;
    } else {
      action = {
        kind: "prime-press",
        zDepthMM: Math.max(0, Number(action.zDepthMM) || 0),
        pressCount: Math.max(1, Math.round(Number(action.pressCount) || 1)),
      };
    }
  } else if (station.type === "dip" || station.type === "wash") {
    if (!action || action.kind !== "brush-motion") {
      action = baseAction;
    } else {
      action = {
        kind: "brush-motion",
        zDepthMM: Math.max(0, Number(action.zDepthMM) || 0),
        pattern: action.pattern,
        repetitions: Math.max(1, Math.round(Number(action.repetitions) || 1)),
        distanceMM: Math.max(0, Number(action.distanceMM) || 0),
      };
    }
  } else {
    action = undefined;
  }

  return {
    ...station,
    dwellMs,
    action,
  };
}

interface AppConfigState {
  enablePerPathPasses: boolean;
  debugLoggingEnabled: boolean;
  showMachineCoordinates: boolean;
  respectSvgColorsOnCanvas: boolean;
  vinylCuttingEnabled: boolean;
  vinylBladeOffsetMM: number;
  vinylCornerAngleThresholdDeg: number;
  vinylMicroJogMagnitudeMM: number;
  showInkServiceStationsOnCanvas: boolean;
  inkServiceStations: InkServiceStation[];
  setEnablePerPathPasses: (enabled: boolean) => void;
  setDebugLoggingEnabled: (enabled: boolean) => void;
  setShowMachineCoordinates: (enabled: boolean) => void;
  setRespectSvgColorsOnCanvas: (enabled: boolean) => void;
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
      respectSvgColorsOnCanvas: false,
      vinylCuttingEnabled: false,
      vinylBladeOffsetMM: 0.25,
      vinylCornerAngleThresholdDeg: 10,
      vinylMicroJogMagnitudeMM: 0.02,
      showInkServiceStationsOnCanvas: false,
      inkServiceStations: structuredClone(DEFAULT_INK_SERVICE_STATIONS),
      setEnablePerPathPasses: (enabled) =>
        set({ enablePerPathPasses: enabled }),
      setDebugLoggingEnabled: (enabled) =>
        set({ debugLoggingEnabled: enabled }),
      setShowMachineCoordinates: (enabled) =>
        set({ showMachineCoordinates: enabled }),
      setRespectSvgColorsOnCanvas: (enabled) =>
        set({ respectSvgColorsOnCanvas: enabled }),
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
          inkServiceStations: stations.map(normalizeStation),
        }),
      updateInkServiceStation: (id, patch) =>
        set((state) => ({
          inkServiceStations: state.inkServiceStations.map((station) =>
            station.id === id
              ? normalizeStation({ ...station, ...patch })
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
                action: {
                  kind: "brush-motion",
                  zDepthMM: 2,
                  pattern: "back-forth",
                  repetitions: 3,
                  distanceMM: 2,
                },
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
