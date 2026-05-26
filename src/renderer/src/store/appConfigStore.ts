import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppConfigState {
  enablePerPathPasses: boolean;
  debugLoggingEnabled: boolean;
  showMachineCoordinates: boolean;
  vinylCuttingEnabled: boolean;
  vinylBladeOffsetMM: number;
  vinylCornerAngleThresholdDeg: number;
  vinylMicroJogMagnitudeMM: number;
  vinylWeedBorderEnabled: boolean;
  vinylWeedBorderMarginMM: number;
  setEnablePerPathPasses: (enabled: boolean) => void;
  setDebugLoggingEnabled: (enabled: boolean) => void;
  setShowMachineCoordinates: (enabled: boolean) => void;
  setVinylCuttingEnabled: (enabled: boolean) => void;
  setVinylBladeOffsetMM: (value: number) => void;
  setVinylCornerAngleThresholdDeg: (value: number) => void;
  setVinylMicroJogMagnitudeMM: (value: number) => void;
  setVinylWeedBorderEnabled: (enabled: boolean) => void;
  setVinylWeedBorderMarginMM: (value: number) => void;
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
      vinylWeedBorderEnabled: false,
      vinylWeedBorderMarginMM: 2,
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
      setVinylWeedBorderEnabled: (enabled) =>
        set({ vinylWeedBorderEnabled: enabled }),
      setVinylWeedBorderMarginMM: (value) =>
        set({ vinylWeedBorderMarginMM: Math.max(0, value) }),
    }),
    { name: "terraforge-app-config" },
  ),
);
