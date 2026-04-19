import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SvgImport } from "../../../../../types";
import { useImportRowRenderer } from "./useImportRowRenderer";

let lastImportRowCardProps: Record<string, unknown> | null = null;

vi.mock("../components/ImportRowCard", () => ({
  ImportRowCard: (props: Record<string, unknown>) => {
    lastImportRowCardProps = props;
    return <div data-testid="import-row-card" />;
  },
}));

const impA: SvgImport = {
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

describe("useImportRowRenderer", () => {
  it("maps selected/expanded/group-color state into ImportRowCard props", () => {
    const args = {
      selectedImportId: "imp-a",
      expandedIds: new Set(["imp-a"]),
      expandedLayerKeys: new Set<string>(),
      draggingImportId: "imp-a",
      layerGroups: [{ id: "g-1", color: "#e94560" }],
      editingName: { id: "imp-a", value: "Renamed" },
      bedW: 220,
      bedH: 200,
      pageW: 210,
      pageH: 297,
      marginMM: 20,
      canAlignToTemplate: true,
      templateAlignEnabled: true,
      templateAlignTarget: "page" as const,
      templateScaleEnabled: false,
      templateScaleTarget: "page" as const,
      ratioLocked: true,
      rotStep: 45 as const,
      stepFlyoutOpen: false,
      showCentreMarker: false,
      importGroupId: () => "g-1",
      onSelectImport: vi.fn(),
      onToggleExpand: vi.fn(),
      onUpdateImport: vi.fn(),
      onStartImportRename: vi.fn(),
      onChangeImportRename: vi.fn(),
      onCommitImportRename: vi.fn(),
      onCancelImportRename: vi.fn(),
      onRemoveImport: vi.fn(),
      onImportDragStart: vi.fn(),
      onImportDragEnd: vi.fn(),
      onToggleLayerCollapse: vi.fn(),
      onUpdateImportLayer: vi.fn(),
      onUpdatePath: vi.fn(),
      onRemovePath: vi.fn(),
      onTemplateAlignEnabledChange: vi.fn(),
      onTemplateAlignTargetChange: vi.fn(),
      onRatioLockedChange: vi.fn(),
      onToggleStepFlyout: vi.fn(),
      onCloseStepFlyout: vi.fn(),
      onSelectRotStep: vi.fn(),
      onToggleCentreMarker: vi.fn(),
      onSyncStrokeWidth: vi.fn(),
      onApplyHatch: vi.fn(),
    };

    const { result } = renderHook(() => useImportRowRenderer(args));
    const node = result.current(impA, true);
    render(<>{node}</>);

    expect(lastImportRowCardProps).toBeTruthy();
    expect(lastImportRowCardProps?.isSelected).toBe(true);
    expect(lastImportRowCardProps?.isExpanded).toBe(true);
    expect(lastImportRowCardProps?.isDragging).toBe(true);
    expect(lastImportRowCardProps?.groupColor).toBe("#e94560");
    expect(lastImportRowCardProps?.editingNameValue).toBe("Renamed");
  });

  it("binds update callbacks to the current import id", () => {
    const onUpdateImport = vi.fn();
    const onSyncStrokeWidth = vi.fn();
    const onUpdatePath = vi.fn();

    const args = {
      selectedImportId: null,
      expandedIds: new Set<string>(),
      expandedLayerKeys: new Set<string>(),
      draggingImportId: null,
      layerGroups: [],
      editingName: null,
      bedW: 220,
      bedH: 200,
      pageW: 210,
      pageH: 297,
      marginMM: 20,
      canAlignToTemplate: false,
      templateAlignEnabled: false,
      templateAlignTarget: "page" as const,
      templateScaleEnabled: false,
      templateScaleTarget: "page" as const,
      ratioLocked: true,
      rotStep: 45 as const,
      stepFlyoutOpen: false,
      showCentreMarker: false,
      importGroupId: () => null,
      onSelectImport: vi.fn(),
      onToggleExpand: vi.fn(),
      onUpdateImport,
      onStartImportRename: vi.fn(),
      onChangeImportRename: vi.fn(),
      onCommitImportRename: vi.fn(),
      onCancelImportRename: vi.fn(),
      onRemoveImport: vi.fn(),
      onImportDragStart: vi.fn(),
      onImportDragEnd: vi.fn(),
      onToggleLayerCollapse: vi.fn(),
      onUpdateImportLayer: vi.fn(),
      onUpdatePath,
      onRemovePath: vi.fn(),
      onTemplateAlignEnabledChange: vi.fn(),
      onTemplateAlignTargetChange: vi.fn(),
      onRatioLockedChange: vi.fn(),
      onToggleStepFlyout: vi.fn(),
      onCloseStepFlyout: vi.fn(),
      onSelectRotStep: vi.fn(),
      onToggleCentreMarker: vi.fn(),
      onSyncStrokeWidth,
      onApplyHatch: vi.fn(),
    };

    const { result } = renderHook(() => useImportRowRenderer(args));
    const node = result.current(impA, false);
    render(<>{node}</>);

    (lastImportRowCardProps?.onUpdate as (c: Partial<SvgImport>) => void)?.({
      x: 5,
    });
    expect(onUpdateImport).toHaveBeenCalledWith("imp-a", { x: 5 });

    (lastImportRowCardProps?.onChangeStrokeWidth as (v: number) => void)?.(0.8);
    expect(onSyncStrokeWidth).toHaveBeenCalledWith("imp-a", 0.8);

    (
      lastImportRowCardProps?.onUpdatePathVisibility as (
        importId: string,
        pathId: string,
        visible: boolean,
      ) => void
    )?.("imp-a", "p-1", false);
    expect(onUpdatePath).toHaveBeenCalledWith("imp-a", "p-1", {
      visible: false,
    });
  });
});
