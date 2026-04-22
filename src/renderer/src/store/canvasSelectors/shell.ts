import type { CanvasState } from "../canvasStore/types";
import { normalizeSvgColor } from "../../features/imports/services/svgImportHelpers";

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
  colorGroupCount: new Set(
    state.imports.flatMap((imp) =>
      imp.paths
        .filter((p) => p.hasFill && !!p.fillColor)
        .map((p) => normalizeSvgColor(p.fillColor ?? "")),
    ),
  ).size,
  pageTemplate: state.pageTemplate,
});
