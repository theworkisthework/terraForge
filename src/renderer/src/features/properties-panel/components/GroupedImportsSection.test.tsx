import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { GroupedImportsSection } from "./GroupedImportsSection";

vi.mock("./GroupHeaderRow", () => ({
  GroupHeaderRow: ({ group }: { group: LayerGroup }) => (
    <div data-testid="group-header-row">{group.name}</div>
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

const group1: LayerGroup = {
  id: "g-1",
  name: "Group 1",
  color: "#e94560",
  importIds: ["imp-a"],
};

const baseProps = {
  layerGroups: [group1],
  imports: [importA],
  collapsedGroupIds: new Set<string>(),
  dragOverGroupId: null,
  selectedGroupId: null,
  editingGroupName: null,
  onSelectGroup: vi.fn(),
  onGroupDragOver: vi.fn(),
  onGroupDragLeave: vi.fn(),
  onGroupDrop: vi.fn(),
  onToggleGroupCollapse: vi.fn(),
  onUpdateLayerGroup: vi.fn(),
  onStartGroupRename: vi.fn(),
  onChangeGroupRename: vi.fn(),
  onCommitGroupRename: vi.fn(),
  onCancelGroupRename: vi.fn(),
  onRemoveLayerGroup: vi.fn(),
  renderImport: (imp: SvgImport): ReactNode => (
    <div key={imp.id} data-testid="rendered-import">
      {imp.name}
    </div>
  ),
};

describe("GroupedImportsSection", () => {
  it("renders group headers and group members", () => {
    render(<GroupedImportsSection {...baseProps} />);
    expect(screen.getAllByTestId("group-header-row")).toHaveLength(1);
    expect(screen.getAllByTestId("rendered-import")).toHaveLength(1);
  });

  it("hides members when a group is collapsed", () => {
    render(
      <GroupedImportsSection
        {...baseProps}
        collapsedGroupIds={new Set([group1.id])}
      />,
    );
    expect(screen.queryByTestId("rendered-import")).toBeNull();
  });

  it("shows empty drop hint for expanded empty groups", () => {
    render(
      <GroupedImportsSection
        {...baseProps}
        layerGroups={[{ ...group1, importIds: [] }]}
      />,
    );
    expect(screen.getByTestId("empty-group-drop-hint")).toBeTruthy();
  });
});
