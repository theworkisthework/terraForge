import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";
import {
  type SvgImport,
  type LayerGroup,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_HATCH_ANGLE_DEG,
} from "../../../types";
import type { CanvasState } from "./canvasStore/types";
import { generateCopyName } from "./canvasStore/services/clipboard";
import { createPageTemplateSlice } from "./canvasStore/slices/pageTemplateSlice";
import { createClipboardSlice } from "./canvasStore/slices/clipboardSlice";
import { createSelectionSlice } from "./canvasStore/slices/selectionSlice";
import { createToolpathSlice } from "./canvasStore/slices/toolpathSlice";
import { createUndoRedoSlice } from "./canvasStore/slices/undoRedoSlice";
import {
  applyImportHatch,
  regenerateImportHatching,
} from "./canvasStore/services/hatching";
import {
  vectorObjectsForGroup,
  vectorObjectsForImports,
  vectorObjectsUngrouped,
} from "./canvasStore/services/vectorObjects";

export { generateCopyName };

export const useCanvasStore = create<CanvasState>()(
  immer((set, get) => {
    const pushUndo = () => {
      const snap = structuredClone(get().imports);
      set((state) => {
        state.undoStack.push(snap);
        if (state.undoStack.length > 50)
          state.undoStack.splice(0, state.undoStack.length - 50);
        // Any new edit invalidates the redo history.
        state.redoStack = [];
      });
    };

    return {
      ...createToolpathSlice(set, get),
      ...createUndoRedoSlice(set, get),
      ...createPageTemplateSlice(set, get),
      ...createClipboardSlice(pushUndo)(set, get),
      ...createSelectionSlice(set, get),
      imports: [],
      layerGroups: [],

      addImport: (imp) => {
        pushUndo();
        set((state) => {
          state.imports.push({
            hatchEnabled: false,
            hatchSpacingMM: DEFAULT_HATCH_SPACING_MM,
            hatchAngleDeg: DEFAULT_HATCH_ANGLE_DEG,
            ...imp,
          });
        });
      },

      removeImport: (id) => {
        if (!get().imports.some((i) => i.id === id)) return;
        pushUndo();
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
        });
      },

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
            regenerateImportHatching(imp);
          }
        }),

      updatePath: (importId, pathId, patch) =>
        set((state) => {
          const imp = state.imports.find((i) => i.id === importId);
          if (!imp) return;
          const path = imp.paths.find((p) => p.id === pathId);
          if (path) Object.assign(path, patch);
        }),

      updateImportLayer: (importId, layerId, visible) =>
        set((state) => {
          const imp = state.imports.find((i) => i.id === importId);
          if (!imp?.layers) return;
          const layer = imp.layers.find((l) => l.id === layerId);
          if (layer) layer.visible = visible;
        }),

      removePath: (importId, pathId) =>
        set((state) => {
          const imp = state.imports.find((i) => i.id === importId);
          if (!imp) return;
          imp.paths = imp.paths.filter((p) => p.id !== pathId);
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

      loadLayout: (newImports, newLayerGroups, newPageTemplate) => {
        pushUndo();
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
          state.selectedGroupId = null;
          state.layerGroups = newLayerGroups ?? [];
          state.pageTemplate = newPageTemplate ?? null;
        });
      },
      selectedImport: () => {
        const { imports, selectedImportId } = get();
        return imports.find((i) => i.id === selectedImportId);
      },

      toVectorObjects: () => vectorObjectsForImports(get().imports),

      applyHatch: (importId, spacingMM, angleDeg, enabled) =>
        set((state) => {
          const imp = state.imports.find((i) => i.id === importId);
          if (!imp) return;
          applyImportHatch(imp, spacingMM, angleDeg, enabled);
        }),
      // ─── Layer Group actions ────────────────────────────────────────────────

      addLayerGroup: (name, color) =>
        set((state) => {
          state.layerGroups.push({ id: uuid(), name, color, importIds: [] });
        }),

      removeLayerGroup: (id) =>
        set((state) => {
          state.layerGroups = state.layerGroups.filter((g) => g.id !== id);
          if (state.selectedGroupId === id) state.selectedGroupId = null;
        }),

      updateLayerGroup: (id, patch) =>
        set((state) => {
          const g = state.layerGroups.find((g) => g.id === id);
          if (!g) return;
          if (patch.name !== undefined) g.name = patch.name;
          if (patch.color !== undefined) g.color = patch.color;
        }),

      assignImportToGroup: (importId, groupId) =>
        set((state) => {
          // Remove from any existing group first
          for (const g of state.layerGroups) {
            g.importIds = g.importIds.filter((id) => id !== importId);
          }
          // Add to the target group if specified
          if (groupId !== null) {
            const g = state.layerGroups.find((g) => g.id === groupId);
            if (g && !g.importIds.includes(importId)) {
              g.importIds.push(importId);
            }
          }
        }),

      toVectorObjectsForGroup: (groupId) => {
        const { imports, layerGroups } = get();
        return vectorObjectsForGroup(imports, layerGroups, groupId);
      },

      toVectorObjectsUngrouped: () => {
        const { imports, layerGroups } = get();
        return vectorObjectsUngrouped(imports, layerGroups);
      },
    };
  }),
);
