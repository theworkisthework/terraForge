import { v4 as uuid } from "uuid";
import type { SvgImport } from "../../../../../types";
import { generateCopyName } from "../services/clipboard";
import type { CanvasStateCreator, ClipboardSlice } from "../types";

export function createClipboardSlice(
  pushUndo: () => void,
): CanvasStateCreator<ClipboardSlice> {
  return (set, get) => ({
    clipboardImport: null,

    copyImport: (id) => {
      const imp = get().imports.find((item) => item.id === id);
      if (!imp) return;
      const snap = structuredClone(imp);
      set((state) => {
        state.clipboardImport = snap;
      });
    },

    cutImport: (id) => {
      const imp = get().imports.find((item) => item.id === id);
      if (!imp) return;
      pushUndo();
      const snap = structuredClone(imp);
      set((state) => {
        state.clipboardImport = snap;
        state.imports = state.imports.filter((item) => item.id !== id);
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
      const existingNames = get().imports.map((item) => item.name);
      const newName = generateCopyName(clipboard.name, existingNames);
      const newId = uuid();
      const pasted: SvgImport = {
        ...structuredClone(clipboard),
        id: newId,
        name: newName,
        paths: clipboard.paths.map((path) => ({ ...path, id: uuid() })),
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
          state.selectedImportId = state.imports[0].id;
          state.allImportsSelected = false;
        } else if (!state.allImportsSelected) {
          state.allImportsSelected = true;
          state.selectedImportId = null;
        } else {
          state.allImportsSelected = false;
          state.selectedImportId = state.imports[0].id;
        }
        state.selectedPathId = null;
        state.toolpathSelected = false;
      }),
  });
}
