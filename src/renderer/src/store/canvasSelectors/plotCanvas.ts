import type { CanvasState } from "../canvasStore/types";

export const selectPlotCanvasCanvasState = (state: CanvasState) => ({
  imports: state.imports,
  selectedImportId: state.selectedImportId,
  allImportsSelected: state.allImportsSelected,
  selectedGroupId: state.selectedGroupId,
  selectGroup: state.selectGroup,
  selectImport: state.selectImport,
  removeImport: state.removeImport,
  clearImports: state.clearImports,
  updateImport: state.updateImport,
  layerGroups: state.layerGroups,
  pageTemplate: state.pageTemplate,
  pageSizes: state.pageSizes,
});

export const selectPlotCanvasToolpathState = (state: CanvasState) => ({
  gcodeToolpath: state.gcodeToolpath,
  setGcodeToolpath: state.setGcodeToolpath,
  gcodeSource: state.gcodeSource,
  toolpathSelected: state.toolpathSelected,
  selectToolpath: state.selectToolpath,
  plotProgressCuts: state.plotProgressCuts,
  plotProgressRapids: state.plotProgressRapids,
});

export const selectPlotCanvasHandleOverlayState = (state: CanvasState) =>
  state.showCentreMarker;
