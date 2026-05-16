import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppConfigState {
  enablePerPathPasses: boolean;
  debugLoggingEnabled: boolean;
  showMachineCoordinates: boolean;
  setEnablePerPathPasses: (enabled: boolean) => void;
  setDebugLoggingEnabled: (enabled: boolean) => void;
  setShowMachineCoordinates: (enabled: boolean) => void;
}

export const useAppConfigStore = create<AppConfigState>()(
  persist(
    (set) => ({
      enablePerPathPasses: false,
      debugLoggingEnabled: false,
      showMachineCoordinates: false,
      setEnablePerPathPasses: (enabled) =>
        set({ enablePerPathPasses: enabled }),
      setDebugLoggingEnabled: (enabled) =>
        set({ debugLoggingEnabled: enabled }),
      setShowMachineCoordinates: (enabled) =>
        set({ showMachineCoordinates: enabled }),
    }),
    { name: "terraforge-app-config" },
  ),
);
