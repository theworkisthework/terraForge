import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useInspectorInteractionState } from "./useInspectorInteractionState";

describe("useInspectorInteractionState", () => {
  it("starts with the expected default state", () => {
    const { result } = renderHook(() => useInspectorInteractionState());

    expect(result.current.rotStep).toBe(45);
    expect(result.current.stepFlyoutOpen).toBe(false);
    expect(result.current.ratioLocked).toBe(true);
    expect(result.current.templateAlignEnabled).toBe(false);
    expect(result.current.templateAlignTarget).toBe("page");
  });

  it("toggles and closes the step flyout", () => {
    const { result } = renderHook(() => useInspectorInteractionState());

    act(() => {
      result.current.toggleStepFlyout();
    });
    expect(result.current.stepFlyoutOpen).toBe(true);

    act(() => {
      result.current.closeStepFlyout();
    });
    expect(result.current.stepFlyoutOpen).toBe(false);
  });

  it("selects a rotation step and closes the flyout", () => {
    const { result } = renderHook(() => useInspectorInteractionState());

    act(() => {
      result.current.toggleStepFlyout();
      result.current.selectRotStep(15);
    });

    expect(result.current.rotStep).toBe(15);
    expect(result.current.stepFlyoutOpen).toBe(false);
  });

  it("allows template/ratio state updates through setters", () => {
    const { result } = renderHook(() => useInspectorInteractionState());

    act(() => {
      result.current.setRatioLocked(false);
      result.current.setTemplateAlignEnabled(true);
      result.current.setTemplateAlignTarget("margin");
    });

    expect(result.current.ratioLocked).toBe(false);
    expect(result.current.templateAlignEnabled).toBe(true);
    expect(result.current.templateAlignTarget).toBe("margin");
  });
});
