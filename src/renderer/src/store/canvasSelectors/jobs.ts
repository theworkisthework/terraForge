import type { CanvasState } from "../canvasStore/types";

export const selectJobActionsCanvasState = (state: CanvasState) => ({
  imports: state.imports,
  layerGroups: state.layerGroups,
  selectedImportId: state.selectedImportId,
  selectedGroupId: state.selectedGroupId,
  pageTemplate: state.pageTemplate,
  pageSizes: state.pageSizes,
  setGcodeToolpath: state.setGcodeToolpath,
  setGcodeSource: state.setGcodeSource,
  selectToolpath: state.selectToolpath,
  toVectorObjectsForGroup: state.toVectorObjectsForGroup,
  toVectorObjectsUngrouped: state.toVectorObjectsUngrouped,
});

export const selectFileBrowserPaneCanvasState = (state: CanvasState) => ({
  gcodeToolpath: state.gcodeToolpath,
  gcodeSource: state.gcodeSource,
  setGcodeToolpath: state.setGcodeToolpath,
  setGcodeSource: state.setGcodeSource,
  selectToolpath: state.selectToolpath,
  setGcodePreviewLoading: state.setGcodePreviewLoading,
});

export const selectJobControlsCanvasState = (state: CanvasState) => ({
  toolpathSelected: state.toolpathSelected,
  gcodeSource: state.gcodeSource,
  gcodeToolpath: state.gcodeToolpath,
  setGcodeToolpath: state.setGcodeToolpath,
  setGcodeSource: state.setGcodeSource,
  selectToolpath: state.selectToolpath,
  gcodePreviewLoading: state.gcodePreviewLoading,
  setGcodePreviewLoading: state.setGcodePreviewLoading,
});

export const selectPlotProgressCanvasState = (state: CanvasState) => ({
  gcodeToolpath: state.gcodeToolpath,
  setPlotProgress: state.setPlotProgress,
  clearPlotProgress: state.clearPlotProgress,
});
