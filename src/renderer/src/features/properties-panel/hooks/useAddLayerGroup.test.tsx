import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAddLayerGroup } from "./useAddLayerGroup";

describe("useAddLayerGroup", () => {
  it("creates the next group name and first palette color", () => {
    const addLayerGroup = vi.fn();
    const { result } = renderHook(() =>
      useAddLayerGroup({ groupCount: 0, addLayerGroup }),
    );

    act(() => {
      result.current();
    });

    expect(addLayerGroup).toHaveBeenCalledWith("Group 1", "#e94560");
  });

  it("cycles through the color palette based on current group count", () => {
    const addLayerGroup = vi.fn();
    const { result } = renderHook(() =>
      useAddLayerGroup({ groupCount: 9, addLayerGroup }),
    );

    act(() => {
      result.current();
    });

    expect(addLayerGroup).toHaveBeenCalledWith("Group 10", "#0ea5e9");
  });
});
