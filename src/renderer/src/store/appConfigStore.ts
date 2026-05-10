import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppConfigState {
  enablePerPathPasses: boolean;
  setEnablePerPathPasses: (enabled: boolean) => void;
}

export const useAppConfigStore = create<AppConfigState>()(
  persist(
    (set) => ({
      enablePerPathPasses: false,
      setEnablePerPathPasses: (enabled) =>
        set({ enablePerPathPasses: enabled }),
    }),
    { name: "terraforge-app-config" },
  ),
);
