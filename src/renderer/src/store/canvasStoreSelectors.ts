import type { CanvasState } from "./canvasStore/types";

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

export const selectImportActionsCanvasState = (state: CanvasState) => ({
  addImport: state.addImport,
  setGcodeToolpath: state.setGcodeToolpath,
  setGcodeSource: state.setGcodeSource,
  selectToolpath: state.selectToolpath,
});

export const selectLayoutActionsCanvasState = (state: CanvasState) => ({
  imports: state.imports,
  layerGroups: state.layerGroups,
  pageTemplate: state.pageTemplate,
  loadLayout: state.loadLayout,
  clearImports: state.clearImports,
});

export const selectJobActionsCanvasState = (state: CanvasState) => ({
  imports: state.imports,
  layerGroups: state.layerGroups,
  pageTemplate: state.pageTemplate,
  pageSizes: state.pageSizes,
  setGcodeToolpath: state.setGcodeToolpath,
  setGcodeSource: state.setGcodeSource,
  selectToolpath: state.selectToolpath,
  toVectorObjectsForGroup: state.toVectorObjectsForGroup,
  toVectorObjectsUngrouped: state.toVectorObjectsUngrouped,
});

export const selectPropertiesPanelStoreBindingsState = (
  state: CanvasState,
) => ({
  imports: state.imports,
  selectedImportId: state.selectedImportId,
  selectImport: state.selectImport,
  removeImport: state.removeImport,
  updateImport: state.updateImport,
  updatePath: state.updatePath,
  updateImportLayer: state.updateImportLayer,
  removePath: state.removePath,
  applyHatch: state.applyHatch,
  showCentreMarker: state.showCentreMarker,
  toggleCentreMarker: state.toggleCentreMarker,
  gcodeToolpath: state.gcodeToolpath,
  gcodeSource: state.gcodeSource,
  setGcodeToolpath: state.setGcodeToolpath,
  toolpathSelected: state.toolpathSelected,
  selectToolpath: state.selectToolpath,
  layerGroups: state.layerGroups,
  addLayerGroup: state.addLayerGroup,
  removeLayerGroup: state.removeLayerGroup,
  updateLayerGroup: state.updateLayerGroup,
  assignImportToGroup: state.assignImportToGroup,
  selectedGroupId: state.selectedGroupId,
  selectGroup: state.selectGroup,
  pageTemplate: state.pageTemplate,
  pageSizes: state.pageSizes,
});

export const selectGcodeOptionsDialogCanvasState = (state: CanvasState) => ({
  layerGroupCount: state.layerGroups.length,
  pageTemplate: state.pageTemplate,
});

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
