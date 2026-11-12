import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { CanvasState } from "./canvasStore/types";
import { createCanvasHistory } from "./canvasStore/history";
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
    const history = createCanvasHistory(set, get);

    return {
      ...createToolpathSlice(set, get, store),
      ...createUndoRedoSlice(history)(set, get, store),
      ...createPageTemplateSlice(history)(set, get, store),
      ...createClipboardSlice(history)(set, get, store),
      ...createImportSlice(history)(set, get, store),
      ...createLayerGroupSlice(history)(set, get, store),
      ...createSelectionSlice(set, get, store),
    };
  }),
);
