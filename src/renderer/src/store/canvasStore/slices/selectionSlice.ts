import type { CanvasStateCreator, SelectionSlice } from "../types";

export const createSelectionSlice: CanvasStateCreator<SelectionSlice> = (
  set,
) => ({
  selectedImportId: null,
  selectedPathId: null,
  allImportsSelected: false,
  toolpathSelected: false,
  selectedGroupId: null,

  selectImport: (id) =>
    set((state) => {
      state.selectedImportId = id;
      state.selectedPathId = null;
      state.allImportsSelected = false;
      state.selectedGroupId = null;
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
      if (selected) {
        state.selectedImportId = null;
        state.selectedPathId = null;
        state.allImportsSelected = false;
        state.selectedGroupId = null;
      }
    }),
});
