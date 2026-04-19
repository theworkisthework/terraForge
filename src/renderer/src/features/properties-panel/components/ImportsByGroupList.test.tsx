import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { ImportsByGroupList } from "./ImportsByGroupList";

vi.mock("./GroupHeaderRow", () => ({
  GroupHeaderRow: ({ group }: { group: LayerGroup }) => (
    <div data-testid="group-header-row">{group.name}</div>
  ),
}));

vi.mock("./ImportRowCard", () => ({
  ImportRowCard: ({ imp }: { imp: SvgImport }) => (
    <div data-testid="import-row-card">{imp.name}</div>
  ),
}));

vi.mock("./UngroupedDropZone", () => ({
  UngroupedDropZone: ({ children }: { children: ReactNode }) => (
    <div data-testid="ungrouped-drop-zone">{children}</div>
  ),
}));

vi.mock("./EmptyGroupDropHint", () => ({
  EmptyGroupDropHint: () => <div data-testid="empty-group-drop-hint" />,
}));

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

const group1: LayerGroup = {
  id: "g-1",
  name: "Group 1",
  color: "#e94560",
  importIds: ["imp-a"],
};

const baseProps = {
  imports: [importA, importB],
  layerGroups: [group1],
  selectedImportId: null,
  selectedGroupId: null,
  expandedIds: new Set<string>(),
  collapsedGroupIds: new Set<string>(),
  expandedLayerKeys: new Set<string>(),
  draggingImportId: null,
  dragOverGroupId: null,
  showUngroupedHint: false,
  bedW: 220,
  bedH: 200,
  pageTemplate: null,
  pageSizes: [],
  templateAlignEnabled: false,
  templateAlignTarget: "page" as const,
  templateScaleEnabled: false,
  templateScaleTarget: "page" as const,
  ratioLocked: true,
  rotStep: 45 as const,
  stepFlyoutOpen: false,
  showCentreMarker: false,
  editingName: null,
  editingGroupName: null,
  importGroupId: (importId: string) =>
    group1.importIds.includes(importId) ? group1.id : null,
  onSelectImport: vi.fn(),
  onSelectGroup: vi.fn(),
  onToggleExpand: vi.fn(),
  onToggleGroupCollapse: vi.fn(),
  onToggleLayerCollapse: vi.fn(),
  onUpdateImport: vi.fn(),
  onUpdateImportLayer: vi.fn(),
  onUpdatePath: vi.fn(),
  onUpdateLayerGroup: vi.fn(),
  onRemoveImport: vi.fn(),
  onRemovePath: vi.fn(),
  onRemoveLayerGroup: vi.fn(),
  onApplyHatch: vi.fn(),
  onSyncStrokeWidth: vi.fn(),
  onToggleCentreMarker: vi.fn(),
  onTemplateAlignEnabledChange: vi.fn(),
  onTemplateAlignTargetChange: vi.fn(),
  onRatioLockedChange: vi.fn(),
  onToggleStepFlyout: vi.fn(),
  onCloseStepFlyout: vi.fn(),
  onSelectRotStep: vi.fn(),
  onImportDragStart: vi.fn(),
  onImportDragEnd: vi.fn(),
  onGroupDragOver: vi.fn(),
  onGroupDragLeave: vi.fn(),
  onGroupDrop: vi.fn(),
  onUngroupedDragOver: vi.fn(),
  onUngroupedDragLeave: vi.fn(),
  onUngroupedDrop: vi.fn(),
  onStartImportRename: vi.fn(),
  onChangeImportRename: vi.fn(),
  onCommitImportRename: vi.fn(),
  onCancelImportRename: vi.fn(),
  onStartGroupRename: vi.fn(),
  onChangeGroupRename: vi.fn(),
  onCommitGroupRename: vi.fn(),
  onCancelGroupRename: vi.fn(),
};

describe("ImportsByGroupList", () => {
  it("renders one group header and both grouped + ungrouped import rows", () => {
    render(<ImportsByGroupList {...baseProps} />);
    expect(screen.getAllByTestId("group-header-row")).toHaveLength(1);
    expect(screen.getAllByTestId("import-row-card")).toHaveLength(2);
    expect(screen.getByTestId("ungrouped-drop-zone")).toBeTruthy();
  });

  it("shows empty group drop hint when a group has no members and is expanded", () => {
    render(
      <ImportsByGroupList
        {...baseProps}
        imports={[importB]}
        layerGroups={[{ ...group1, importIds: [] }]}
      />,
    );
    expect(screen.getByTestId("empty-group-drop-hint")).toBeTruthy();
  });

  it("hides group members when the group is collapsed", () => {
    render(
      <ImportsByGroupList
        {...baseProps}
        collapsedGroupIds={new Set([group1.id])}
      />,
    );
    // only ungrouped import should remain visible
    expect(screen.getAllByTestId("import-row-card")).toHaveLength(1);
  });
});
