import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
  type SvgImport,
} from "../../../../../types";
import {
  applyImportHatch,
  regenerateImportHatching,
} from "../services/hatching";
import { refitImportToPaths } from "../services/importBounds";
import { vectorObjectsForImports } from "../services/vectorObjects";
import { coalesceKeyFor, type CanvasHistory } from "../history";
import type { CanvasState, CanvasStateCreator, ImportSlice } from "../types";

/** Takes an import that is going away out of whichever layer group holds it. */
export function removeFromLayerGroups(state: CanvasState, importId: string) {
  for (const group of state.layerGroups) {
    if (group.importIds.includes(importId)) {
      group.importIds = group.importIds.filter((id) => id !== importId);
    }
  }
}

function patchImport(state: CanvasState, id: string, patch: Partial<SvgImport>) {
  const imp = state.imports.find((item) => item.id === id);
  if (!imp) return;
  Object.assign(imp, patch);
  if (
    imp.hatchEnabled &&
    ("scale" in patch || "scaleX" in patch || "scaleY" in patch)
  ) {
    regenerateImportHatching(imp);
  }
}

function withDefaultHatchSettings(imp: SvgImport): SvgImport {
  const normalizedPaths = imp.paths.map((path) => {
    const sourceOutlineVisible =
      typeof path.sourceOutlineVisible === "boolean"
        ? path.sourceOutlineVisible
        : path.outlineVisible !== false;

    const generatedStrokeEnabled =
      typeof path.generatedStrokeEnabled === "boolean"
        ? sourceOutlineVisible
          ? path.generatedStrokeEnabled
          : path.generatedStrokeEnabled
            ? true
            : undefined
        : undefined;

    return {
      ...path,
      sourceOutlineVisible,
      strokeEnabled: path.strokeEnabled ?? true,
      generatedStrokeEnabled,
    };
  });

  return {
    hatchEnabled: false,
    hatchSpacingMM: DEFAULT_HATCH_SPACING_MM,
    hatchAngleDeg: DEFAULT_HATCH_ANGLE_DEG,
    strokeEnabled: true,
    plotPointsEnabled: false,
    generatedStrokeForNoStroke: false,
    ...imp,
    paths: normalizedPaths,
  };
}

export function createImportSlice(
  history: CanvasHistory,
): CanvasStateCreator<ImportSlice> {
  const { edit } = history;
  return (set, get) => ({
    imports: [],

    addImport: (imp) =>
      edit((state) => {
        state.imports.push(withDefaultHatchSettings(imp));
      }),

    removeImport: (id) => {
      if (!get().imports.some((item) => item.id === id)) return;
      edit((state) => {
        state.imports = state.imports.filter((item) => item.id !== id);
        removeFromLayerGroups(state, id);
        if (state.selectedImportId === id) {
          state.selectedImportId = null;
          state.selectedPathId = null;
        }
        if (state.allImportsSelected) {
          state.allImportsSelected = false;
          if (state.imports.length === 1) {
            state.selectedImportId = state.imports[0].id;
          } else if (state.imports.length === 0) {
            state.selectedImportId = null;
          }
        }
      });
    },

    updateImport: (id, patch) =>
      edit((state) => patchImport(state, id, patch), coalesceKeyFor(`import:${id}`, patch)),

    applyRenderResult: (id, patch) => set((state) => patchImport(state, id, patch)),

    updatePath: (importId, pathId, patch) =>
      edit((state) => {
        const imp = state.imports.find((item) => item.id === importId);
        if (!imp) return;
        const path = imp.paths.find((item) => item.id === pathId);
        if (path) Object.assign(path, patch);
      }, coalesceKeyFor(`path:${importId}:${pathId}`, patch)),

    updateImportLayer: (importId, layerId, visible) =>
      edit((state) => {
        const imp = state.imports.find((item) => item.id === importId);
        if (!imp?.layers) return;
        const layer = imp.layers.find((item) => item.id === layerId);
        if (layer) layer.visible = visible;
      }),

    removePath: (importId, pathId) =>
      edit((state) => {
        const imp = state.imports.find((item) => item.id === importId);
        if (!imp || !imp.paths.some((item) => item.id === pathId)) return;
        imp.paths = imp.paths.filter((item) => item.id !== pathId);
        refitImportToPaths(imp);
        if (state.selectedPathId === pathId) state.selectedPathId = null;
      }),

    clearImports: () => {
      if (get().imports.length === 0) return;
      edit((state) => {
        state.imports = [];
        state.selectedImportId = null;
        state.selectedPathId = null;
        state.allImportsSelected = false;
        state.selectedGroupId = null;
        state.layerGroups = [];
      });
    },

    loadLayout: (imports, layerGroups, pageTemplate) => {
      // Not part of whatever edit came before it, even in the same turn.
      history.interrupt();
      edit((state) => {
        state.imports = imports.map(withDefaultHatchSettings);
        state.selectedImportId = null;
        state.selectedPathId = null;
        state.allImportsSelected = false;
        state.selectedGroupId = null;
        state.layerGroups = layerGroups ?? [];
        state.pageTemplate = pageTemplate ?? null;
      });
      history.interrupt();
      // What was just loaded is what the layout file holds.
      get().markSaved();
    },

    selectedImport: () => {
      const { imports, selectedImportId } = get();
      return imports.find((item) => item.id === selectedImportId);
    },

    toVectorObjects: () => vectorObjectsForImports(get().imports),

    applyHatch: (importId, spacingMM, angleDeg, enabled) => {
      const current = get().imports.find((item) => item.id === importId);
      edit(
        (state) => {
          const imp = state.imports.find((item) => item.id === importId);
          if (!imp) return;
          applyImportHatch(imp, spacingMM, angleDeg, enabled);
        },
        // Turning hatching on or off is a step of its own; dragging its
        // spacing or angle is one step for the whole drag.
        current && !!current.hatchEnabled === enabled ? `hatch:${importId}` : undefined,
      );
    },
  });
}
