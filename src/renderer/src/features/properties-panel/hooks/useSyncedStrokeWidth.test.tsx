import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { useSyncedStrokeWidth } from "./useSyncedStrokeWidth";

const importA: SvgImport = {
  id: "imp-a",
  name: "A",
  paths: [],
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 100,
  svgHeight: 100,
  viewBoxX: 0,
  viewBoxY: 0,
};

const importB: SvgImport = {
  id: "imp-b",
  name: "B",
  paths: [],
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 100,
  svgHeight: 100,
  viewBoxX: 0,
  viewBoxY: 0,
};

const importC: SvgImport = {
  id: "imp-c",
  name: "C",
  paths: [],
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 100,
  svgHeight: 100,
  viewBoxX: 0,
  viewBoxY: 0,
};

const groupedLayer: LayerGroup = {
  id: "g-1",
  name: "Group 1",
  color: "#e94560",
  importIds: ["imp-a", "imp-b"],
};

describe("useSyncedStrokeWidth", () => {
  it("syncs width across imports in the same group", () => {
    const updateImport = vi.fn();
    const { result } = renderHook(() =>
      useSyncedStrokeWidth({
        imports: [importA, importB, importC],
        layerGroups: [groupedLayer],
        importGroupId: (importId) =>
          groupedLayer.importIds.includes(importId) ? groupedLayer.id : null,
        updateImport,
      }),
    );

    result.current("imp-a", 0.8);

    expect(updateImport).toHaveBeenCalledTimes(2);
    expect(updateImport).toHaveBeenCalledWith("imp-a", { strokeWidthMM: 0.8 });
    expect(updateImport).toHaveBeenCalledWith("imp-b", { strokeWidthMM: 0.8 });
  });

  it("syncs width across all ungrouped imports", () => {
    const updateImport = vi.fn();
    const { result } = renderHook(() =>
      useSyncedStrokeWidth({
        imports: [importA, importB, importC],
        layerGroups: [groupedLayer],
        importGroupId: (importId) =>
          groupedLayer.importIds.includes(importId) ? groupedLayer.id : null,
        updateImport,
      }),
    );

    result.current("imp-c", 0.5);

    expect(updateImport).toHaveBeenCalledTimes(1);
    expect(updateImport).toHaveBeenCalledWith("imp-c", { strokeWidthMM: 0.5 });
  });
});
