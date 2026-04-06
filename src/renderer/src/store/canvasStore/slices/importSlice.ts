import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
  type SvgImport,
} from "../../../../../types";
import {
  applyImportHatch,
  regenerateImportHatching,
} from "../services/hatching";
import { vectorObjectsForImports } from "../services/vectorObjects";
import type { CanvasStateCreator, ImportSlice } from "../types";

function withDefaultHatchSettings(imp: SvgImport): SvgImport {
  return {
    hatchEnabled: false,
    hatchSpacingMM: DEFAULT_HATCH_SPACING_MM,
    hatchAngleDeg: DEFAULT_HATCH_ANGLE_DEG,
    ...imp,
  };
}

export function createImportSlice(
  pushUndo: () => void,
): CanvasStateCreator<ImportSlice> {
  return (set, get) => ({
    imports: [],

    addImport: (imp) => {
      pushUndo();
      set((state) => {
        state.imports.push(withDefaultHatchSettings(imp));
      });
    },

    removeImport: (id) => {
      if (!get().imports.some((item) => item.id === id)) return;
      pushUndo();
      set((state) => {
        state.imports = state.imports.filter((item) => item.id !== id);
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
      set((state) => {
        const imp = state.imports.find((item) => item.id === id);
        if (!imp) return;
        Object.assign(imp, patch);
        if (
          imp.hatchEnabled &&
          ("scale" in patch || "scaleX" in patch || "scaleY" in patch)
        ) {
          regenerateImportHatching(imp);
        }
      }),

    updatePath: (importId, pathId, patch) =>
      set((state) => {
        const imp = state.imports.find((item) => item.id === importId);
        if (!imp) return;
        const path = imp.paths.find((item) => item.id === pathId);
        if (path) Object.assign(path, patch);
      }),

    updateImportLayer: (importId, layerId, visible) =>
      set((state) => {
        const imp = state.imports.find((item) => item.id === importId);
        if (!imp?.layers) return;
        const layer = imp.layers.find((item) => item.id === layerId);
        if (layer) layer.visible = visible;
      }),

    removePath: (importId, pathId) =>
      set((state) => {
        const imp = state.imports.find((item) => item.id === importId);
        if (!imp) return;
        imp.paths = imp.paths.filter((item) => item.id !== pathId);
        if (state.selectedPathId === pathId) state.selectedPathId = null;
      }),

    clearImports: () => {
      if (get().imports.length === 0) return;
      pushUndo();
      set((state) => {
        state.imports = [];
        state.selectedImportId = null;
        state.selectedPathId = null;
        state.allImportsSelected = false;
        state.selectedGroupId = null;
        state.layerGroups = [];
      });
    },

    loadLayout: (imports, layerGroups, pageTemplate) => {
      pushUndo();
      set((state) => {
        state.imports = imports.map(withDefaultHatchSettings);
        state.selectedImportId = null;
        state.selectedPathId = null;
        state.allImportsSelected = false;
        state.selectedGroupId = null;
        state.layerGroups = layerGroups ?? [];
        state.pageTemplate = pageTemplate ?? null;
      });
    },

    selectedImport: () => {
      const { imports, selectedImportId } = get();
      return imports.find((item) => item.id === selectedImportId);
    },

    toVectorObjects: () => vectorObjectsForImports(get().imports),

    applyHatch: (importId, spacingMM, angleDeg, enabled) =>
      set((state) => {
        const imp = state.imports.find((item) => item.id === importId);
        if (!imp) return;
        applyImportHatch(imp, spacingMM, angleDeg, enabled);
      }),
  });
}
