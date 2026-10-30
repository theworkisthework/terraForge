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
  immer((set, get, store) => {
    const pushUndo = () => {
      // Not a copy: immer state is never changed in place (see undoRedoSlice).
      const snap = get().imports;
      set((state) => {
        state.undoStack.push(snap);
        if (state.undoStack.length > 50)
          state.undoStack.splice(0, state.undoStack.length - 50);
        // Any new edit invalidates the redo history.
        state.redoStack = [];
      });
    };

    return {
      ...createToolpathSlice(set, get, store),
      ...createUndoRedoSlice(set, get, store),
      ...createPageTemplateSlice(set, get, store),
      ...createClipboardSlice(pushUndo)(set, get, store),
      ...createImportSlice(pushUndo)(set, get, store),
      ...createLayerGroupSlice(set, get, store),
      ...createSelectionSlice(set, get, store),
    };
  }),
);
