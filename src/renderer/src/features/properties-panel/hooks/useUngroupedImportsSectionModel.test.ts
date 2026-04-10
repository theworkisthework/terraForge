import { describe, expect, it } from "vitest";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { useUngroupedImportsSectionModel } from "./useUngroupedImportsSectionModel";

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
  ...importA,
  id: "imp-b",
  name: "B",
};

const group1: LayerGroup = {
  id: "g-1",
  name: "Group 1",
  color: "#e94560",
  importIds: ["imp-a"],
};

describe("useUngroupedImportsSectionModel", () => {
  it("derives ungrouped imports and drop target state", () => {
    const model = useUngroupedImportsSectionModel({
      imports: [importA, importB],
      layerGroups: [group1],
      dragOverGroupId: "none",
    });

    expect(model.ungroupedImports).toHaveLength(1);
    expect(model.ungroupedImports[0].id).toBe("imp-b");
    expect(model.isDropTarget).toBe(true);
  });
});
