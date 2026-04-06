import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePanelExpansionState } from "./usePanelExpansionState";

describe("usePanelExpansionState", () => {
  it("toggles expanded import ids", () => {
    const { result } = renderHook(() => usePanelExpansionState());

    act(() => {
      result.current.toggleExpand("imp-1");
    });
    expect(result.current.expandedIds.has("imp-1")).toBe(true);

    act(() => {
      result.current.toggleExpand("imp-1");
    });
    expect(result.current.expandedIds.has("imp-1")).toBe(false);
  });

  it("toggles collapsed group ids", () => {
    const { result } = renderHook(() => usePanelExpansionState());

    act(() => {
      result.current.toggleGroupCollapse("group-1");
    });
    expect(result.current.collapsedGroupIds.has("group-1")).toBe(true);

    act(() => {
      result.current.toggleGroupCollapse("group-1");
    });
    expect(result.current.collapsedGroupIds.has("group-1")).toBe(false);
  });

  it("toggles expanded layer keys", () => {
    const { result } = renderHook(() => usePanelExpansionState());

    act(() => {
      result.current.toggleLayerCollapse("imp-1", "layer-1");
    });
    expect(result.current.expandedLayerKeys.has("imp-1:layer-1")).toBe(true);

    act(() => {
      result.current.toggleLayerCollapse("imp-1", "layer-1");
    });
    expect(result.current.expandedLayerKeys.has("imp-1:layer-1")).toBe(false);
  });
});
