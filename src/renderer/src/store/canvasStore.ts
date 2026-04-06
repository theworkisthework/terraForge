import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { CanvasState } from "./canvasStore/types";
import { generateCopyName } from "./canvasStore/services/clipboard";
import { createPageTemplateSlice } from "./canvasStore/slices/pageTemplateSlice";
import { createClipboardSlice } from "./canvasStore/slices/clipboardSlice";
import { createImportSlice } from "./canvasStore/slices/importSlice";
import { createLayerGroupSlice } from "./canvasStore/slices/layerGroupSlice";
import { createSelectionSlice } from "./canvasStore/slices/selectionSlice";
import { createToolpathSlice } from "./canvasStore/slices/toolpathSlice";
import { createUndoRedoSlice } from "./canvasStore/slices/undoRedoSlice";

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
      ...createImportSlice(pushUndo)(set, get),
      ...createLayerGroupSlice(set, get),
      ...createSelectionSlice(set, get),
    };
  }),
);
