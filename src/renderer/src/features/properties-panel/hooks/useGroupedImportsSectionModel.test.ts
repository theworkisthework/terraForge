import { describe, expect, it } from "vitest";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { useGroupedImportsSectionModel } from "./useGroupedImportsSectionModel";

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

const group1: LayerGroup = {
  id: "g-1",
  name: "Group 1",
  color: "#e94560",
  importIds: ["imp-a"],
};

describe("useGroupedImportsSectionModel", () => {
  it("derives member, selection, drop-target, and editing state", () => {
    const view = useGroupedImportsSectionModel({
      layerGroups: [group1],
      imports: [importA],
      collapsedGroupIds: new Set(["g-1"]),
      dragOverGroupId: "g-1",
      selectedGroupId: "g-1",
      editingGroupName: { id: "g-1", value: "Renamed" },
    });

    expect(view).toHaveLength(1);
    expect(view[0].members).toHaveLength(1);
    expect(view[0].isCollapsed).toBe(true);
    expect(view[0].isDropTarget).toBe(true);
    expect(view[0].isSelected).toBe(true);
    expect(view[0].isEditingName).toBe(true);
    expect(view[0].editingNameValue).toBe("Renamed");
  });
});
