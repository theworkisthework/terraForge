import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";
import {
  type SvgImport,
  type SvgPath,
  type VectorObject,
  type LayerGroup,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_HATCH_ANGLE_DEG,
} from "../../../types";
import { generateHatchPaths } from "../utils/hatchFill";
import type { CanvasState } from "./canvasStore/types";
import { createPageTemplateSlice } from "./canvasStore/slices/pageTemplateSlice";
import { createToolpathSlice } from "./canvasStore/slices/toolpathSlice";

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

// ─── Gesture-undo stash ──────────────────────────────────────────────────────
// Holds a snapshot captured at gesture-start (drag/scale/rotate mousedown).
// Committed to undoStack on mouseup only if imports actually changed.
let _gestureSnapshot: SvgImport[] | null = null;

const gestureFingerprint = (imps: SvgImport[]) =>
  imps
    .map(
      (i) =>
        `${i.id}:${i.x},${i.y},${i.scale},${i.scaleX ?? ""},${i.scaleY ?? ""},${i.rotation ?? 0}`,
    )
    .join("|");

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
      ...createPageTemplateSlice(set, get),
      imports: [],
      undoStack: [],
      redoStack: [],
      selectedImportId: null,
      selectedPathId: null,
      allImportsSelected: false,
      selectedGroupId: null,
      clipboardImport: null,
      toolpathSelected: false,
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

      selectImport: (id) =>
        set((state) => {
          state.selectedImportId = id;
          state.selectedPathId = null;
          state.allImportsSelected = false;
          state.selectedGroupId = null;
          // Selecting an SVG import clears toolpath selection (and vice-versa).
          if (id !== null) state.toolpathSelected = false;
        }),

      selectGroup: (id) =>
        set((state) => {
          state.selectedGroupId = id;
          state.selectedImportId = null;
          state.selectedPathId = null;
          state.allImportsSelected = false;
          state.toolpathSelected = false;
        }),

      selectToolpath: (selected) =>
        set((state) => {
          state.toolpathSelected = selected;
          // Selecting the toolpath clears any SVG import selection.
          if (selected) {
            state.selectedImportId = null;
            state.selectedPathId = null;
            state.allImportsSelected = false;
            state.selectedGroupId = null;
          }
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

      toVectorObjects: (): VectorObject[] =>
        get()
          .imports.filter((imp) => imp.visible)
          .flatMap((imp) => {
            const hiddenLayerIds = imp.layers
              ? new Set(imp.layers.filter((l) => !l.visible).map((l) => l.id))
              : null;
            const layerVisible = (p: SvgPath) =>
              !hiddenLayerIds || !p.layer || !hiddenLayerIds.has(p.layer);
            return imp.paths
              .filter((p) => p.visible && layerVisible(p))
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
              });
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
        pushUndo();
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
        pushUndo();
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
          state.selectedGroupId = null;
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

      snapshotForGesture: () => {
        _gestureSnapshot = structuredClone(get().imports);
        // Starting a new gesture invalidates the redo history.
        set((state) => {
          state.redoStack = [];
        });
      },

      commitGesture: () => {
        const before = _gestureSnapshot;
        _gestureSnapshot = null;
        if (!before) return;
        const current = get().imports;
        // Only push if something gesture-mutable actually changed.
        if (gestureFingerprint(before) === gestureFingerprint(current)) return;
        set((state) => {
          state.undoStack.push(before);
          if (state.undoStack.length > 50)
            state.undoStack.splice(0, state.undoStack.length - 50);
        });
      },

      undo: () => {
        const stack = get().undoStack;
        if (stack.length === 0) return;
        const prev = stack[stack.length - 1];
        const currentSnap = structuredClone(get().imports);
        set((state) => {
          state.imports = structuredClone(prev);
          state.undoStack.pop();
          state.redoStack.push(currentSnap);
          if (state.redoStack.length > 50)
            state.redoStack.splice(0, state.redoStack.length - 50);
          state.selectedImportId = null;
          state.selectedPathId = null;
          state.allImportsSelected = false;
        });
      },

      redo: () => {
        const stack = get().redoStack;
        if (stack.length === 0) return;
        const next = stack[stack.length - 1];
        const currentSnap = structuredClone(get().imports);
        set((state) => {
          state.imports = structuredClone(next);
          state.redoStack.pop();
          state.undoStack.push(currentSnap);
          if (state.undoStack.length > 50)
            state.undoStack.splice(0, state.undoStack.length - 50);
          state.selectedImportId = null;
          state.selectedPathId = null;
          state.allImportsSelected = false;
        });
      },

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
        const group = layerGroups.find((g) => g.id === groupId);
        if (!group) return [];
        const groupImportIds = new Set(group.importIds);
        return imports
          .filter((imp) => imp.visible && groupImportIds.has(imp.id))
          .flatMap((imp) => {
            const hiddenLayerIds = imp.layers
              ? new Set(imp.layers.filter((l) => !l.visible).map((l) => l.id))
              : null;
            const layerVisible = (p: SvgPath) =>
              !hiddenLayerIds || !p.layer || !hiddenLayerIds.has(p.layer);
            return imp.paths
              .filter((p) => p.visible && layerVisible(p))
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
              });
          });
      },

      toVectorObjectsUngrouped: () => {
        const { imports, layerGroups } = get();
        const allGroupedIds = new Set(layerGroups.flatMap((g) => g.importIds));
        return imports
          .filter((imp) => imp.visible && !allGroupedIds.has(imp.id))
          .flatMap((imp) => {
            const hiddenLayerIds = imp.layers
              ? new Set(imp.layers.filter((l) => !l.visible).map((l) => l.id))
              : null;
            const layerVisible = (p: SvgPath) =>
              !hiddenLayerIds || !p.layer || !hiddenLayerIds.has(p.layer);
            return imp.paths
              .filter((p) => p.visible && layerVisible(p))
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
              });
          });
      },
    };
  }),
);
