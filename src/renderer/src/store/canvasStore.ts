import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";
import {
  type SvgImport,
  type SvgPath,
  type VectorObject,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_HATCH_ANGLE_DEG,
} from "../../../types";
import type { GcodeToolpath } from "../utils/gcodeParser";
import { generateHatchPaths } from "../utils/hatchFill";

// ─── Clipboard helpers ────────────────────────────────────────────────────────

/**
 * Generate a unique copy name for a pasted import, following the pattern:
 * "<base> copy" → "<base> copy (2)" → "<base> copy (3)" etc.
 * Strips any existing copy suffix from sourceName before computing the base,
 * so copying "foo copy" produces "foo copy (2)" rather than "foo copy copy".
 */
export function generateCopyName(
  sourceName: string,
  existingNames: string[],
): string {
  const base = sourceName.replace(/ copy \(\d+\)$/, "").replace(/ copy$/, "");
  const copyBase = `${base} copy`;
  if (!existingNames.includes(copyBase)) return copyBase;
  let n = 2;
  while (existingNames.includes(`${copyBase} (${n})`)) n++;
  return `${copyBase} (${n})`;
}

interface CanvasState {
  imports: SvgImport[];
  selectedImportId: string | null;
  selectedPathId: string | null;
  /** True when the user has "selected all" canvas imports (Ctrl+A). Cleared when
   *  a single import is clicked, imports are cleared, or the toolpath is selected. */
  allImportsSelected: boolean;
  /** In-memory clipboard for cut/copy/paste of canvas imports. */
  clipboardImport: SvgImport | null;
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
  /** Replace the entire imports list atomically — used by canvas layout load. */
  loadLayout: (imports: SvgImport[]) => void;
  selectedImport: () => SvgImport | undefined;
  setGcodeToolpath: (tp: GcodeToolpath | null) => void;
  setGcodeSource: (
    src: { path: string; name: string; source: "local" | "fs" | "sd" } | null,
  ) => void;
  toggleCentreMarker: () => void;
  toVectorObjects: () => VectorObject[];
  /** True while a G-code preview is being fetched/parsed before a job starts. */
  gcodePreviewLoading: boolean;
  setGcodePreviewLoading: (loading: boolean) => void;
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

  // ─── Clipboard ──────────────────────────────────────────────────────────────
  /** Copy the selected import to the in-memory clipboard without removing it. */
  copyImport: (id: string) => void;
  /** Copy to clipboard and remove the import from the canvas. */
  cutImport: (id: string) => void;
  /** Paste the clipboard import as a new copy with an offset position and generated name. */
  pasteImport: () => void;
  /** Select all canvas imports.  If already all-selected, cycles to the first single
   *  import so repeated Ctrl+A is still useful. */
  selectAllImports: () => void;
}

export const useCanvasStore = create<CanvasState>()(
  immer((set, get) => ({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    allImportsSelected: false,
    clipboardImport: null,
    gcodeToolpath: null,
    gcodeSource: null,
    toolpathSelected: false,
    showCentreMarker: true,
    plotProgressCuts: "",
    plotProgressRapids: "",
    gcodePreviewLoading: false,
    setGcodePreviewLoading: (loading) =>
      set((state) => {
        state.gcodePreviewLoading = loading;
      }),

    addImport: (imp) =>
      set((state) => {
        state.imports.push({
          hatchEnabled: false,
          hatchSpacingMM: DEFAULT_HATCH_SPACING_MM,
          hatchAngleDeg: DEFAULT_HATCH_ANGLE_DEG,
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
        // If we were in "all selected" mode, re-evaluate — if only one remains select
        // it individually; if none remain clear everything.
        if (state.allImportsSelected) {
          state.allImportsSelected = false;
          if (state.imports.length === 1) {
            state.selectedImportId = state.imports[0].id;
          } else if (state.imports.length === 0) {
            state.selectedImportId = null;
          }
        }
      }),

    updateImport: (id, patch) =>
      set((state) => {
        const imp = state.imports.find((i) => i.id === id);
        if (!imp) return;
        Object.assign(imp, patch);
        // If scale/scaleX/scaleY changed while hatch is enabled, regenerate hatch lines
        // so the physical spacing (in mm) stays correct after resize.
        if (
          imp.hatchEnabled &&
          ("scale" in patch || "scaleX" in patch || "scaleY" in patch)
        ) {
          const effectiveScale = Math.sqrt(
            (imp.scaleX ?? imp.scale) * (imp.scaleY ?? imp.scale),
          );
          const spacingMM = imp.hatchSpacingMM ?? DEFAULT_HATCH_SPACING_MM;
          const angleDeg = imp.hatchAngleDeg ?? DEFAULT_HATCH_ANGLE_DEG;
          if (
            effectiveScale > 0 &&
            Number.isFinite(effectiveScale) &&
            spacingMM > 0 &&
            Number.isFinite(angleDeg)
          ) {
            const spacingUnits = spacingMM / effectiveScale;
            for (const p of imp.paths) {
              if (!p.hasFill) {
                p.hatchLines = undefined;
                continue;
              }
              const lines = generateHatchPaths(p.d, spacingUnits, angleDeg);
              p.hatchLines = lines.length ? lines : undefined;
            }
          }
        }
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
        state.allImportsSelected = false;
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
          state.allImportsSelected = false;
        }
      }),

    clearImports: () =>
      set((state) => {
        state.imports = [];
        state.selectedImportId = null;
        state.selectedPathId = null;
        state.allImportsSelected = false;
      }),

    loadLayout: (newImports) =>
      set((state) => {
        state.imports = newImports.map((imp) => ({
          hatchEnabled: false,
          hatchSpacingMM: DEFAULT_HATCH_SPACING_MM,
          hatchAngleDeg: DEFAULT_HATCH_ANGLE_DEG,
          ...imp,
        }));
        state.selectedImportId = null;
        state.selectedPathId = null;
        state.allImportsSelected = false;
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

        // Sanitize incoming values before persisting to avoid storing NaN/Infinity
        // (which can arrive transiently from <input type="number"> while editing).
        const safeSpacing =
          Number.isFinite(spacingMM) && spacingMM > 0
            ? spacingMM
            : imp.hatchSpacingMM;
        const safeAngle = Number.isFinite(angleDeg)
          ? angleDeg
          : imp.hatchAngleDeg;

        // Persist user configuration
        imp.hatchEnabled = enabled;
        imp.hatchSpacingMM = safeSpacing;
        imp.hatchAngleDeg = safeAngle;

        // When non-uniform scaling is active (scaleX/scaleY set independently),
        // use the geometric mean of the two axis scales so mm spacing is consistent
        // regardless of which axis the user adjusted.
        const effectiveScale = Math.sqrt(
          (imp.scaleX ?? imp.scale) * (imp.scaleY ?? imp.scale),
        );

        // Defense in depth: only generate hatch lines when configuration is valid.
        const spacingIsValid =
          Number.isFinite(safeSpacing) &&
          safeSpacing > 0 &&
          Number.isFinite(safeAngle) &&
          effectiveScale > 0 &&
          Number.isFinite(effectiveScale) &&
          enabled;

        if (!spacingIsValid) {
          // Invalid spacing/scale or hatching disabled: clear any existing hatch lines.
          for (const p of imp.paths) {
            p.hatchLines = undefined;
          }
          return;
        }

        const spacingUnits = safeSpacing / effectiveScale;

        for (const p of imp.paths) {
          if (!p.hasFill) {
            p.hatchLines = undefined;
            continue;
          }

          const lines = generateHatchPaths(p.d, spacingUnits, safeAngle);
          p.hatchLines = lines.length ? lines : undefined;
        }
      }),

    // ─── Clipboard actions ──────────────────────────────────────────────────

    copyImport: (id) => {
      const imp = get().imports.find((i) => i.id === id);
      if (!imp) return;
      const snap = structuredClone(imp);
      set((state) => {
        state.clipboardImport = snap;
      });
    },

    cutImport: (id) => {
      const imp = get().imports.find((i) => i.id === id);
      if (!imp) return;
      const snap = structuredClone(imp);
      set((state) => {
        state.clipboardImport = snap;
        state.imports = state.imports.filter((i) => i.id !== id);
        if (state.selectedImportId === id) {
          state.selectedImportId = null;
          state.selectedPathId = null;
        }
      });
    },

    pasteImport: () => {
      const clipboard = get().clipboardImport;
      if (!clipboard) return;
      const existingNames = get().imports.map((i) => i.name);
      const newName = generateCopyName(clipboard.name, existingNames);
      const newId = uuid();
      const pasted: SvgImport = {
        ...structuredClone(clipboard),
        id: newId,
        name: newName,
        // Assign fresh IDs to all paths so they don't alias the originals
        paths: clipboard.paths.map((p) => ({ ...p, id: uuid() })),
        // Offset slightly so the copy doesn't sit exactly on top of the original
        x: clipboard.x + 5,
        y: clipboard.y + 5,
      };
      set((state) => {
        state.imports.push(pasted);
        state.selectedImportId = newId;
        state.selectedPathId = null;
        if (state.toolpathSelected) state.toolpathSelected = false;
      });
    },

    selectAllImports: () =>
      set((state) => {
        if (state.imports.length === 0) return;
        if (state.imports.length === 1) {
          // Only one import — just select it directly.
          state.selectedImportId = state.imports[0].id;
          state.allImportsSelected = false;
        } else if (!state.allImportsSelected) {
          // Zero or one import selected → enter "all selected" mode.
          state.allImportsSelected = true;
          state.selectedImportId = null;
        } else {
          // Already all-selected → cycle to the first import individually.
          state.allImportsSelected = false;
          state.selectedImportId = state.imports[0].id;
        }
        state.selectedPathId = null;
        state.toolpathSelected = false;
      }),
  })),
);
