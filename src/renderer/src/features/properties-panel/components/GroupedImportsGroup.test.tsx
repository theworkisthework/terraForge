import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { GroupedImportsGroup } from "./GroupedImportsGroup";

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
  group: group1,
  members: [importA],
  isCollapsed: false,
  isDropTarget: false,
  isSelected: false,
  isEditingName: false,
  editingNameValue: group1.name,
  selectedGroupId: null,
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

describe("GroupedImportsGroup", () => {
  it("renders group header and members when expanded", () => {
    render(<GroupedImportsGroup {...baseProps} />);
    expect(screen.getByTestId("group-header-row")).toBeTruthy();
    expect(screen.getAllByTestId("rendered-import")).toHaveLength(1);
  });

  it("shows empty drop hint when expanded and empty", () => {
    render(
      <GroupedImportsGroup {...baseProps} members={[]} isDropTarget={true} />,
    );
    expect(screen.getByTestId("empty-group-drop-hint")).toBeTruthy();
  });
});
