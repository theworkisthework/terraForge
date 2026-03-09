import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { SvgImport, SvgPath, VectorObject } from "../../../types";
import type { GcodeToolpath } from "../utils/gcodeParser";

interface CanvasState {
  imports: SvgImport[];
  selectedImportId: string | null;
  selectedPathId: string | null;
  gcodeToolpath: GcodeToolpath | null;
  /** Persists the local file info for a canvas-imported G-code file so it can
   *  be restored in selectedJobFile whenever the user re-selects the toolpath.
   *  Automatically cleared when gcodeToolpath is set to null. */
  gcodeSource: { path: string; name: string } | null;
  showCentreMarker: boolean;

  addImport: (imp: SvgImport) => void;
  removeImport: (id: string) => void;
  updateImport: (id: string, patch: Partial<SvgImport>) => void;
  updatePath: (
    importId: string,
    pathId: string,
    patch: Partial<SvgPath>,
  ) => void;
  removePath: (importId: string, pathId: string) => void;
  selectImport: (id: string | null) => void;
  clearImports: () => void;
  selectedImport: () => SvgImport | undefined;
  setGcodeToolpath: (tp: GcodeToolpath | null) => void;
  setGcodeSource: (src: { path: string; name: string } | null) => void;
  toggleCentreMarker: () => void;
  toVectorObjects: () => VectorObject[];
}

export const useCanvasStore = create<CanvasState>()(
  immer((set, get) => ({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    gcodeToolpath: null,
    gcodeSource: null,
    showCentreMarker: true,

    addImport: (imp) =>
      set((state) => {
        state.imports.push(imp);
      }),

    removeImport: (id) =>
      set((state) => {
        state.imports = state.imports.filter((i) => i.id !== id);
        if (state.selectedImportId === id) {
          state.selectedImportId = null;
          state.selectedPathId = null;
        }
      }),

    updateImport: (id, patch) =>
      set((state) => {
        const imp = state.imports.find((i) => i.id === id);
        if (imp) Object.assign(imp, patch);
      }),

    updatePath: (importId, pathId, patch) =>
      set((state) => {
        const imp = state.imports.find((i) => i.id === importId);
        if (!imp) return;
        const path = imp.paths.find((p) => p.id === pathId);
        if (path) Object.assign(path, patch);
      }),

    removePath: (importId, pathId) =>
      set((state) => {
        const imp = state.imports.find((i) => i.id === importId);
        if (!imp) return;
        imp.paths = imp.paths.filter((p) => p.id !== pathId);
        if (state.selectedPathId === pathId) state.selectedPathId = null;
      }),

    selectImport: (id) =>
      set((state) => {
        state.selectedImportId = id;
        state.selectedPathId = null;
      }),

    clearImports: () =>
      set((state) => {
        state.imports = [];
        state.selectedImportId = null;
        state.selectedPathId = null;
      }),

    selectedImport: () => {
      const { imports, selectedImportId } = get();
      return imports.find((i) => i.id === selectedImportId);
    },

    setGcodeToolpath: (tp) =>
      set((state) => {
        state.gcodeToolpath = tp as GcodeToolpath;
        // Auto-clear the stored local-file source when the toolpath is removed.
        if (tp === null) state.gcodeSource = null;
      }),

    setGcodeSource: (src) =>
      set((state) => {
        state.gcodeSource = src;
      }),

    toggleCentreMarker: () =>
      set((state) => {
        state.showCentreMarker = !state.showCentreMarker;
      }),

    toVectorObjects: (): VectorObject[] =>
      get()
        .imports.filter((imp) => imp.visible)
        .flatMap((imp) =>
          imp.paths
            .filter((p) => p.visible)
            .map(
              (p): VectorObject => ({
                id: p.id,
                svgSource: p.svgSource,
                path: p.d,
                x: imp.x,
                y: imp.y,
                scale: imp.scale,
                scaleX: imp.scaleX,
                scaleY: imp.scaleY,
                rotation: imp.rotation,
                visible: true,
                originalWidth: imp.svgWidth,
                originalHeight: imp.svgHeight,
                layer: p.layer,
              }),
            ),
        ),
  })),
);
