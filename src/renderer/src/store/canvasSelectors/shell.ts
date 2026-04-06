import type { CanvasState } from "../canvasStore/types";

export const selectToolbarCanvasState = (state: CanvasState) => ({
  imports: state.imports,
  selectedImportId: state.selectedImportId,
  clearImports: state.clearImports,
  copyImport: state.copyImport,
  cutImport: state.cutImport,
  pasteImport: state.pasteImport,
  selectAllImports: state.selectAllImports,
  clipboardImport: state.clipboardImport,
  allImportsSelected: state.allImportsSelected,
  undo: state.undo,
  redo: state.redo,
  pageTemplate: state.pageTemplate,
  setPageTemplate: state.setPageTemplate,
  pageSizes: state.pageSizes,
  setPageSizes: state.setPageSizes,
});

export const selectGcodeOptionsDialogCanvasState = (state: CanvasState) => ({
  layerGroupCount: state.layerGroups.length,
  pageTemplate: state.pageTemplate,
});
