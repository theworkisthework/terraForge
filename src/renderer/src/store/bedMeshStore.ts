import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BedMesh } from "../../../types";

interface BedMeshState {
  enabled: boolean;
  mesh: BedMesh | null;
  setEnabled: (enabled: boolean) => void;
  setMesh: (mesh: BedMesh | null) => void;
}

export const useBedMeshStore = create<BedMeshState>()(
  persist(
    (set) => ({
      enabled: false,
      mesh: null,
      setEnabled: (enabled) => set({ enabled }),
      setMesh: (mesh) => set({ mesh }),
    }),
    { name: "terraforge-bed-mesh" },
  ),
);
