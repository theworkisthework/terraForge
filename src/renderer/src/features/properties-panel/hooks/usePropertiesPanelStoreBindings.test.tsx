import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasStore } from "../../../store/canvasStore";
import { useMachineStore } from "../../../store/machineStore";
import { usePropertiesPanelStoreBindings } from "./usePropertiesPanelStoreBindings";

beforeEach(() => {
  useCanvasStore.setState({
    imports: [],
    layerGroups: [],
    selectedImportId: null,
    gcodeToolpath: null,
    gcodeSource: null,
    toolpathSelected: false,
    pageTemplate: null,
  });
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
  });
});

describe("usePropertiesPanelStoreBindings", () => {
  it("surfaces canvas store state", () => {
    useCanvasStore.setState({ toolpathSelected: true });
    const { result } = renderHook(() => usePropertiesPanelStoreBindings());
    expect(result.current.toolpathSelected).toBe(true);
    expect(result.current.layerGroups).toHaveLength(0);
    expect(result.current.imports).toHaveLength(0);
  });

  it("surfaces machine status from machine store", () => {
    const status = {
      raw: "<Run>",
      state: "Run" as const,
      mpos: { x: 0, y: 0, z: 0 },
      wpos: { x: 0, y: 0, z: 0 },
    };
    useMachineStore.setState({ status });
    const { result } = renderHook(() => usePropertiesPanelStoreBindings());
    expect(result.current.machineStatus?.state).toBe("Run");
    expect(result.current.machineStatus?.mpos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("exposes action functions from both stores", () => {
    const { result } = renderHook(() => usePropertiesPanelStoreBindings());
    expect(typeof result.current.updateImport).toBe("function");
    expect(typeof result.current.removeImport).toBe("function");
    expect(typeof result.current.addLayerGroup).toBe("function");
    expect(typeof result.current.activeConfig).toBe("function");
    expect(typeof result.current.setGcodeToolpath).toBe("function");
  });
});
