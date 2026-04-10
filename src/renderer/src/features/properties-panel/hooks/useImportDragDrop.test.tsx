import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useImportDragDrop } from "./useImportDragDrop";

describe("useImportDragDrop", () => {
  it("tracks drag start/end and ungrouped hint visibility", () => {
    const assignImportToGroup = vi.fn();
    const setCollapsedGroupIds = vi.fn();
    const { result } = renderHook(() =>
      useImportDragDrop({
        assignImportToGroup,
        importGroupId: (id) => (id === "imp-1" ? "g1" : null),
        setCollapsedGroupIds,
      }),
    );

    const setData = vi.fn();
    const dragStartEvent = {
      dataTransfer: {
        setData,
        effectAllowed: "",
      },
    } as any;

    act(() => {
      result.current.handleImportDragStart(dragStartEvent, "imp-1");
    });

    expect(setData).toHaveBeenCalledWith("text/plain", "imp-1");
    expect(dragStartEvent.dataTransfer.effectAllowed).toBe("move");
    expect(result.current.draggingImportId).toBe("imp-1");
    expect(result.current.showUngroupedHint).toBe(true);

    act(() => {
      result.current.handleImportDragEnd();
    });

    expect(result.current.draggingImportId).toBeNull();
    expect(result.current.dragOverGroupId).toBeNull();
    expect(result.current.showUngroupedHint).toBe(false);
  });

  it("handles group drop and resets drag state", () => {
    const assignImportToGroup = vi.fn();
    const setCollapsedGroupIds = vi.fn();
    const { result } = renderHook(() =>
      useImportDragDrop({
        assignImportToGroup,
        importGroupId: () => "g1",
        setCollapsedGroupIds,
      }),
    );

    act(() => {
      result.current.handleImportDragStart(
        {
          dataTransfer: {
            setData: () => {},
            effectAllowed: "",
          },
        } as any,
        "imp-2",
      );
    });

    const preventDefault = vi.fn();
    act(() => {
      result.current.handleGroupDragOver({ preventDefault } as any, "g2");
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.dragOverGroupId).toBe("g2");

    act(() => {
      result.current.handleGroupDrop(
        {
          preventDefault: vi.fn(),
          dataTransfer: { getData: () => "imp-2" },
        } as any,
        "g2",
      );
    });

    expect(assignImportToGroup).toHaveBeenCalledWith("imp-2", "g2");
    expect(setCollapsedGroupIds).toHaveBeenCalledTimes(1);
    expect(result.current.draggingImportId).toBeNull();
    expect(result.current.dragOverGroupId).toBeNull();
  });
});
