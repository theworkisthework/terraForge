import type { CanvasState } from "../canvasStore/types";

export const selectLayoutActionsCanvasState = (state: CanvasState) => ({
  imports: state.imports,
  layerGroups: state.layerGroups,
  pageTemplate: state.pageTemplate,
  loadLayout: state.loadLayout,
  clearImports: state.clearImports,
});
