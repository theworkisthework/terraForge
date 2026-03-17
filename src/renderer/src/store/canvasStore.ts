import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { SvgImport, SvgPath, VectorObject } from "../../../types";
import type { GcodeToolpath } from "../utils/gcodeParser";
import { generateHatchPaths } from "../utils/hatchFill";

interface CanvasState {
  imports: SvgImport[];
  selectedImportId: string | null;
  selectedPathId: string | null;
  gcodeToolpath: GcodeToolpath | null;
  /** Persists the file info for the currently loaded G-code toolpath so it
   *  can be restored into selectedJobFile when the user re-selects the toolpath
   *  on the canvas.  source mirrors SelectedJobFile.source.
   *  Automatically cleared when gcodeToolpath is set to null. */
  gcodeSource: {
    path: string;
    name: string;
    source: "local" | "fs" | "sd";
  } | null;
  showCentreMarker: boolean;
  /** Live plot-progress overlay paths (machine-coord SVG path d strings).
   *  Built incrementally by usePlotProgress as the machine reports its position.
   *  Empty strings = nothing to show. */
  plotProgressCuts: string;
  plotProgressRapids: string;

  addImport: (imp: SvgImport) => void;
  removeImport: (id: string) => void;
  updateImport: (id: string, patch: Partial<SvgImport>) => void;
  updatePath: (
    importId: string,
    pathId: string,
    patch: Partial<SvgPath>,
  ) => void;
  removePath: (importId: string, pathId: string) => void;
  /** Whether the G-code toolpath is currently selected on the canvas. */
  toolpathSelected: boolean;
  selectImport: (id: string | null) => void;
  /** Select or deselect the G-code toolpath.  Deselects any SVG import. */
  selectToolpath: (selected: boolean) => void;
  clearImports: () => void;
  selectedImport: () => SvgImport | undefined;
  setGcodeToolpath: (tp: GcodeToolpath | null) => void;
  setGcodeSource: (
    src: { path: string; name: string; source: "local" | "fs" | "sd" } | null,
  ) => void;
  toggleCentreMarker: () => void;
  toVectorObjects: () => VectorObject[];
  /** Update the live plot-progress overlay paths. */
  setPlotProgress: (cuts: string, rapids: string) => void;
  /** Reset progress overlay (called when toolpath changes or job clears). */
  clearPlotProgress: () => void;
  /** Regenerate hatch lines for all filled paths in an import using the given settings. */
  applyHatch: (
    importId: string,
    spacingMM: number,
    angleDeg: number,
    enabled: boolean,
  ) => void;
}

export const useCanvasStore = create<CanvasState>()(
  immer((set, get) => ({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    gcodeToolpath: null,
    gcodeSource: null,
    toolpathSelected: false,
    showCentreMarker: true,
    plotProgressCuts: "",
    plotProgressRapids: "",

    addImport: (imp) =>
      set((state) => {
        state.imports.push({
          hatchEnabled: false,
          hatchSpacingMM: 2,
          hatchAngleDeg: 45,
          ...imp,
        });
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
        // Selecting an SVG import clears toolpath selection (and vice-versa).
        if (id !== null) state.toolpathSelected = false;
      }),

    selectToolpath: (selected) =>
      set((state) => {
        state.toolpathSelected = selected;
        // Selecting the toolpath clears any SVG import selection.
        if (selected) {
          state.selectedImportId = null;
          state.selectedPathId = null;
        }
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
        if (tp === null) {
          state.gcodeSource = null;
          state.toolpathSelected = false;
          state.plotProgressCuts = "";
          state.plotProgressRapids = "";
        }
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
            .flatMap((p): VectorObject[] => {
              const base: VectorObject = {
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
              };
              const outlineVOs: VectorObject[] =
                p.outlineVisible !== false ? [base] : [];
              const hatchVOs: VectorObject[] = (p.hatchLines ?? []).map(
                (hl, i): VectorObject => ({
                  ...base,
                  id: `${p.id}-h${i}`,
                  svgSource: "",
                  path: hl,
                }),
              );
              return [...outlineVOs, ...hatchVOs];
            }),
        ),

    setPlotProgress: (cuts, rapids) =>
      set((state) => {
        state.plotProgressCuts = cuts;
        state.plotProgressRapids = rapids;
      }),

    clearPlotProgress: () =>
      set((state) => {
        state.plotProgressCuts = "";
        state.plotProgressRapids = "";
      }),

    applyHatch: (importId, spacingMM, angleDeg, enabled) =>
      set((state) => {
        const imp = state.imports.find((i) => i.id === importId);
        if (!imp) return;
        imp.hatchEnabled = enabled;
        imp.hatchSpacingMM = spacingMM;
        imp.hatchAngleDeg = angleDeg;
        const spacingUnits = imp.scale > 0 ? spacingMM / imp.scale : spacingMM;
        for (const p of imp.paths) {
          if (!p.hasFill) {
            p.hatchLines = undefined;
            continue;
          }
          if (!enabled) {
            p.hatchLines = undefined;
          } else {
            const lines = generateHatchPaths(p.d, spacingUnits, angleDeg);
            p.hatchLines = lines.length ? lines : undefined;
          }
        }
      }),
  })),
);
