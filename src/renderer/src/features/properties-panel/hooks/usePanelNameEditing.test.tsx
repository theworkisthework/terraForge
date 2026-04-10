import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePanelNameEditing } from "./usePanelNameEditing";

describe("usePanelNameEditing", () => {
  it("handles import rename lifecycle", () => {
    const updateImport = vi.fn();
    const updateLayerGroup = vi.fn();
    const { result } = renderHook(() =>
      usePanelNameEditing({ updateImport, updateLayerGroup }),
    );

    act(() => {
      result.current.startImportRename("imp-1", "Old");
    });
    expect(result.current.editingName).toEqual({ id: "imp-1", value: "Old" });

    act(() => {
      result.current.changeImportRename("New");
    });
    expect(result.current.editingName).toEqual({ id: "imp-1", value: "New" });

    act(() => {
      result.current.commitImportRename("imp-1", "New");
    });
    expect(updateImport).toHaveBeenCalledWith("imp-1", { name: "New" });
    expect(result.current.editingName).toBeNull();
  });

  it("handles group rename fallback and cancel", () => {
    const updateImport = vi.fn();
    const updateLayerGroup = vi.fn();
    const { result } = renderHook(() =>
      usePanelNameEditing({ updateImport, updateLayerGroup }),
    );

    act(() => {
      result.current.startGroupRename("g1", "Group One");
    });
    expect(result.current.editingGroupName).toEqual({
      id: "g1",
      value: "Group One",
    });

    act(() => {
      result.current.changeGroupRename("   ");
      result.current.commitGroupRename("g1", "   ", "Group One");
    });
    expect(updateLayerGroup).toHaveBeenCalledWith("g1", { name: "Group One" });
    expect(result.current.editingGroupName).toBeNull();

    act(() => {
      result.current.startGroupRename("g2", "Group Two");
      result.current.cancelGroupRename();
    });
    expect(result.current.editingGroupName).toBeNull();
  });
});
