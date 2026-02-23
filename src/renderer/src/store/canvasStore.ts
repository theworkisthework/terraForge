import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { VectorObject } from "../../../types";
import type { GcodeToolpath } from "../utils/gcodeParser";

interface CanvasState {
  objects: VectorObject[];
  selectedId: string | null;
  gcodeToolpath: GcodeToolpath | null;

  addObject: (obj: VectorObject) => void;
  removeObject: (id: string) => void;
  updateObject: (id: string, patch: Partial<VectorObject>) => void;
  selectObject: (id: string | null) => void;
  clearObjects: () => void;
  selectedObject: () => VectorObject | undefined;
  setGcodeToolpath: (tp: GcodeToolpath | null) => void;
}

export const useCanvasStore = create<CanvasState>()(
  immer((set, get) => ({
    objects: [],
    selectedId: null,
    gcodeToolpath: null,

    addObject: (obj) =>
      set((state) => {
        state.objects.push(obj);
      }),

    removeObject: (id) =>
      set((state) => {
        state.objects = state.objects.filter((o) => o.id !== id);
        if (state.selectedId === id) state.selectedId = null;
      }),

    updateObject: (id, patch) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === id);
        if (obj) Object.assign(obj, patch);
      }),

    selectObject: (id) =>
      set((state) => {
        state.selectedId = id;
      }),

    clearObjects: () =>
      set((state) => {
        state.objects = [];
        state.selectedId = null;
      }),

    selectedObject: () => {
      const { objects, selectedId } = get();
      return objects.find((o) => o.id === selectedId);
    },

    setGcodeToolpath: (tp) =>
      set((state) => {
        state.gcodeToolpath = tp as GcodeToolpath;
      }),
  })),
);
