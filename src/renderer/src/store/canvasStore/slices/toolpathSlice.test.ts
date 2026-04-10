import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createToolpathSlice } from "./toolpathSlice";

type ToolpathState = ReturnType<typeof createToolpathSlice>;

function makeStore() {
  return create<ToolpathState>()(
    immer((set, get) => ({
      // Include selection fields used by the slice side-effects.
      toolpathSelected: false,
      selectedImportId: null,
      selectedPathId: null,
      allImportsSelected: false,
      selectedGroupId: null,
      ...createToolpathSlice(set as any, get as any),
    })),
  );
}

describe("toolpathSlice", () => {
  it("starts with expected defaults", () => {
    const store = makeStore();
    const state = store.getState();

    expect(state.gcodeToolpath).toBeNull();
    expect(state.gcodeSource).toBeNull();
    expect(state.showCentreMarker).toBe(true);
    expect(state.plotProgressCuts).toBe("");
    expect(state.plotProgressRapids).toBe("");
    expect(state.gcodePreviewLoading).toBe(false);
  });

  it("setGcodeToolpath stores non-null toolpath without clearing source", () => {
    const store = makeStore();
    const source = {
      path: "/job.gcode",
      name: "job.gcode",
      source: "sd" as const,
    };
    store.getState().setGcodeSource(source);

    const toolpath = {
      segments: [],
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    };
    store.getState().setGcodeToolpath(toolpath as any);

    expect(store.getState().gcodeToolpath).toEqual(toolpath);
    expect(store.getState().gcodeSource).toEqual(source);
  });

  it("setGcodeToolpath(null) clears source, selection flag, and progress overlays", () => {
    const store = makeStore();
    store.setState({
      toolpathSelected: true,
      plotProgressCuts: "M0 0 L1 1",
      plotProgressRapids: "M1 1 L2 2",
    });
    store.getState().setGcodeSource({
      path: "/job.gcode",
      name: "job.gcode",
      source: "local",
    });

    store.getState().setGcodeToolpath(null);

    const state = store.getState();
    expect(state.gcodeToolpath).toBeNull();
    expect(state.gcodeSource).toBeNull();
    expect(state.toolpathSelected).toBe(false);
    expect(state.plotProgressCuts).toBe("");
    expect(state.plotProgressRapids).toBe("");
  });

  it("setGcodeSource updates source metadata", () => {
    const store = makeStore();

    store.getState().setGcodeSource({
      path: "/mnt/sd/job.gcode",
      name: "job.gcode",
      source: "sd",
    });

    expect(store.getState().gcodeSource).toEqual({
      path: "/mnt/sd/job.gcode",
      name: "job.gcode",
      source: "sd",
    });
  });

  it("setGcodePreviewLoading toggles loading flag", () => {
    const store = makeStore();

    store.getState().setGcodePreviewLoading(true);
    expect(store.getState().gcodePreviewLoading).toBe(true);

    store.getState().setGcodePreviewLoading(false);
    expect(store.getState().gcodePreviewLoading).toBe(false);
  });

  it("setPlotProgress and clearPlotProgress manage overlay paths", () => {
    const store = makeStore();

    store.getState().setPlotProgress("M0 0 L1 1", "M1 1 L2 2");
    expect(store.getState().plotProgressCuts).toBe("M0 0 L1 1");
    expect(store.getState().plotProgressRapids).toBe("M1 1 L2 2");

    store.getState().clearPlotProgress();
    expect(store.getState().plotProgressCuts).toBe("");
    expect(store.getState().plotProgressRapids).toBe("");
  });

  it("toggleCentreMarker flips the center marker state", () => {
    const store = makeStore();
    expect(store.getState().showCentreMarker).toBe(true);

    store.getState().toggleCentreMarker();
    expect(store.getState().showCentreMarker).toBe(false);

    store.getState().toggleCentreMarker();
    expect(store.getState().showCentreMarker).toBe(true);
  });
});
