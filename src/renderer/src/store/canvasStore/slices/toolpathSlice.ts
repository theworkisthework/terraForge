import type { CanvasStateCreator, ToolpathSlice } from "../types";
import type { GcodeToolpath } from "../../../utils/gcodeParser";

export const createToolpathSlice: CanvasStateCreator<ToolpathSlice> = (
  set,
) => ({
  gcodeToolpath: null,
  gcodeSource: null,
  showCentreMarker: true,
  toolpathVisible: true,
  toolpathOpacity: 1,
  plotProgressCuts: "",
  plotProgressRapids: "",
  gcodePreviewLoading: false,

  setGcodePreviewLoading: (loading) =>
    set((state) => {
      state.gcodePreviewLoading = loading;
    }),

  setGcodeToolpath: (toolpath) =>
    set((state) => {
      state.gcodeToolpath = toolpath as GcodeToolpath;
      if (toolpath === null) {
        state.gcodeSource = null;
        state.toolpathSelected = false;
        state.plotProgressCuts = "";
        state.plotProgressRapids = "";
      }
    }),

  setGcodeSource: (source) =>
    set((state) => {
      state.gcodeSource = source;
    }),

  toggleCentreMarker: () =>
    set((state) => {
      state.showCentreMarker = !state.showCentreMarker;
    }),

  setToolpathVisible: (visible) =>
    set((state) => {
      state.toolpathVisible = visible;
    }),

  setToolpathOpacity: (opacity) =>
    set((state) => {
      state.toolpathOpacity = Math.max(0.1, Math.min(1, opacity));
    }),

  setPlotProgress: (cuts, rapids) =>
    set((state) => {
      state.plotProgressCuts = cuts;
      state.plotProgressRapids = rapids;
    }),

  clearPlotProgress: () =>
    set((state) => {
      state.plotProgressCuts = "";
      state.plotProgressRapids = "";
    }),
});
