import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SvgImport } from "../../../../../types";
import { ImportRowCard } from "./ImportRowCard";

vi.mock("./ImportHeaderRow", () => ({
  ImportHeaderRow: () => <div data-testid="import-header-row" />,
}));

vi.mock("./ImportPathsList", () => ({
  ImportPathsList: () => <div data-testid="import-paths-list" />,
}));

vi.mock("./ImportPropertiesForm", () => ({
  ImportPropertiesForm: () => <div data-testid="import-properties-form" />,
}));

const mockImport: SvgImport = {
  id: "imp-1",
  name: "import-1",
  paths: [],
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 100,
  svgHeight: 80,
  viewBoxX: 0,
  viewBoxY: 0,
};

const baseProps = {
  imp: mockImport,
  indented: false,
  isSelected: false,
  isExpanded: false,
  isDragging: false,
  groupColor: null,
  expandedLayerKeys: new Set<string>(),
  isEditingName: false,
  editingNameValue: mockImport.name,
  bedW: 220,
  bedH: 200,
  pageW: 210,
  pageH: 297,
  marginMM: 20,
  canAlignToTemplate: false,
  templateAlignEnabled: false,
  templateAlignTarget: "page" as const,
  ratioLocked: true,
  rotStep: 45 as const,
  stepFlyoutOpen: false,
  showCentreMarker: false,
  onSelectImport: vi.fn(),
  onToggleExpand: vi.fn(),
  onToggleVisibility: vi.fn(),
  onStartRename: vi.fn(),
  onEditingNameChange: vi.fn(),
  onCommitName: vi.fn(),
  onCancelName: vi.fn(),
  onDeleteImport: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
  onToggleLayerCollapse: vi.fn(),
  onUpdateLayerVisibility: vi.fn(),
  onUpdatePathVisibility: vi.fn(),
  onRemovePath: vi.fn(),
  onUpdate: vi.fn(),
  onTemplateAlignEnabledChange: vi.fn(),
  onTemplateAlignTargetChange: vi.fn(),
  onRatioLockedChange: vi.fn(),
  onToggleStepFlyout: vi.fn(),
  onCloseStepFlyout: vi.fn(),
  onSelectRotStep: vi.fn(),
  onToggleCentreMarker: vi.fn(),
  onChangeStrokeWidth: vi.fn(),
  onApplyHatch: vi.fn(),
};

describe("ImportRowCard", () => {
  it("always renders the import header row", () => {
    render(<ImportRowCard {...baseProps} />);
    expect(screen.getByTestId("import-header-row")).toBeTruthy();
  });

  it("renders paths list only when expanded", () => {
    const { rerender } = render(<ImportRowCard {...baseProps} />);
    expect(screen.queryByTestId("import-paths-list")).toBeNull();

    rerender(<ImportRowCard {...baseProps} isExpanded={true} />);
    expect(screen.getByTestId("import-paths-list")).toBeTruthy();
  });

  it("renders properties form only when selected", () => {
    const { rerender } = render(<ImportRowCard {...baseProps} />);
    expect(screen.queryByTestId("import-properties-form")).toBeNull();

    rerender(<ImportRowCard {...baseProps} isSelected={true} />);
    expect(screen.getByTestId("import-properties-form")).toBeTruthy();
  });

  it("applies selected and dragging classes", () => {
    const { container } = render(
      <ImportRowCard {...baseProps} isSelected={true} isDragging={true} />,
    );
    const root = container.firstElementChild as HTMLDivElement;
    expect(root.className).toContain("bg-secondary/20");
    expect(root.className).toContain("opacity-40");
  });
});
