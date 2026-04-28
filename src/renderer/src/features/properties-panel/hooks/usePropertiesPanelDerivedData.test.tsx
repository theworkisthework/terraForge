import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  LayerGroup,
  MachineConfig,
  MachineStatus,
} from "../../../../../types";
import { usePropertiesPanelDerivedData } from "./usePropertiesPanelDerivedData";

const group1: LayerGroup = {
  id: "g-1",
  name: "Group 1",
  color: "#e94560",
  importIds: ["imp-a"],
};

const machineConfig: MachineConfig = {
  id: "mc-1",
  name: "Test Machine",
  bedWidth: 420,
  bedHeight: 297,
  origin: "bottom-left",
  penType: "solenoid",
  penUpCommand: "M5",
  penDownCommand: "M3 S1000",
  penDownDelayMs: 50,
  penUpDelayMs: 0,
  jogSpeed: 3200,
  drawSpeed: 1800,
  connection: { type: "wifi", host: "test.local", port: 80 },
};

const runningStatus: MachineStatus = {
  raw: "<Run|MPos:0,0,0>",
  state: "Run",
  mpos: { x: 0, y: 0, z: 0 },
  wpos: { x: 0, y: 0, z: 0 },
};

describe("usePropertiesPanelDerivedData", () => {
  it("derives machine/toolpath values and resolves import group ids", () => {
    const { result } = renderHook(() =>
      usePropertiesPanelDerivedData({
        layerGroups: [group1],
        machineStatus: runningStatus,
        activeConfig: () => machineConfig,
        gcodeSource: { path: "x", name: "job.gcode", source: "local" },
      }),
    );

    expect(result.current.isJobActive).toBe(true);
    expect(result.current.fallbackFeedrate).toBe(1800);
    expect(result.current.bedW).toBe(420);
    expect(result.current.bedH).toBe(297);
    expect(result.current.toolpathFileName).toBe("job.gcode");
    expect(result.current.importGroupId("imp-a")).toBe("g-1");
    expect(result.current.importGroupId("missing")).toBeNull();
  });

  it("falls back to default values when config/source are absent", () => {
    const { result } = renderHook(() =>
      usePropertiesPanelDerivedData({
        layerGroups: [],
        machineStatus: {
          raw: "<Idle>",
          state: "Idle",
          mpos: { x: 0, y: 0, z: 0 },
          wpos: { x: 0, y: 0, z: 0 },
        },
        activeConfig: () => undefined,
        gcodeSource: null,
      }),
    );

    expect(result.current.isJobActive).toBe(false);
    expect(result.current.fallbackFeedrate).toBe(3000);
    expect(result.current.bedW).toBe(220);
    expect(result.current.bedH).toBe(200);
    expect(result.current.toolpathFileName).toBe("G-code toolpath");
  });
});
