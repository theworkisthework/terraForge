import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppConfigState {
  enablePerPathPasses: boolean;
  debugLoggingEnabled: boolean;
  setEnablePerPathPasses: (enabled: boolean) => void;
  setDebugLoggingEnabled: (enabled: boolean) => void;
}

export const useAppConfigStore = create<AppConfigState>()(
  persist(
    (set) => ({
      enablePerPathPasses: false,
      debugLoggingEnabled: false,
      setEnablePerPathPasses: (enabled) =>
        set({ enablePerPathPasses: enabled }),
      setDebugLoggingEnabled: (enabled) =>
        set({ debugLoggingEnabled: enabled }),
    }),
    { name: "terraforge-app-config" },
  ),
);
