import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SvgImport } from "../../../../../types";
import { useImportsByGroupListModel } from "./useImportsByGroupListModel";

const resolvePageBoundsMock = vi.fn();
const useImportRowRendererMock = vi.fn();

vi.mock("../utils/pageBounds", () => ({
  resolvePageBounds: (...args: unknown[]) => resolvePageBoundsMock(...args),
}));

vi.mock("./useImportRowRenderer", () => ({
  useImportRowRenderer: (...args: unknown[]) =>
    useImportRowRendererMock(...args),
}));

describe("useImportsByGroupListModel", () => {
  it("derives page bounds and forwards composed args to useImportRowRenderer", () => {
    const renderImport = vi.fn();
    resolvePageBoundsMock.mockReturnValue({
      pageW: 210,
      pageH: 297,
      canAlignToTemplate: true,
      marginMM: 20,
    });
    useImportRowRendererMock.mockReturnValue(renderImport);

    const args = {
      selectedImportId: "imp-1",
      expandedIds: new Set(["imp-1"]),
      expandedLayerKeys: new Set<string>(),
      draggingImportId: null,
      layerGroups: [{ id: "g-1", name: "Group", color: "#fff", importIds: [] }],
      editingName: null,
      bedW: 220,
      bedH: 200,
      pageTemplate: null,
      pageSizes: [],
      templateAlignEnabled: false,
      templateAlignTarget: "page" as const,
      ratioLocked: true,
      rotStep: 45 as const,
      stepFlyoutOpen: false,
      showCentreMarker: false,
      importGroupId: vi.fn(),
      onSelectImport: vi.fn(),
      onToggleExpand: vi.fn(),
      onUpdateImport:
        vi.fn<(id: string, changes: Partial<SvgImport>) => void>(),
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

    const { result } = renderHook(() => useImportsByGroupListModel(args));

    expect(resolvePageBoundsMock).toHaveBeenCalledWith({
      bedW: 220,
      bedH: 200,
      pageTemplate: null,
      pageSizes: [],
    });
    expect(useImportRowRendererMock).toHaveBeenCalledTimes(1);
    expect(useImportRowRendererMock.mock.calls[0][0]).toMatchObject({
      pageW: 210,
      pageH: 297,
      canAlignToTemplate: true,
      marginMM: 20,
      selectedImportId: "imp-1",
    });
    expect(result.current.groupedSectionProps.renderImport).toBe(renderImport);
    expect(result.current.ungroupedSectionProps.renderImport).toBe(
      renderImport,
    );
  });
});
