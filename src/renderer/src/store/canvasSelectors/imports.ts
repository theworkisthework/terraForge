import type { CanvasState } from "../canvasStore/types";

export const selectImportActionsCanvasState = (state: CanvasState) => ({
  addImport: state.addImport,
  setGcodeToolpath: state.setGcodeToolpath,
  setGcodeSource: state.setGcodeSource,
  selectToolpath: state.selectToolpath,
});
