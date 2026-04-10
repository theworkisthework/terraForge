import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasKeyboardShortcuts } from "./useCanvasKeyboardShortcuts";
import { useCanvasStore } from "../../../store/canvasStore";
import { ZOOM_STEP } from "../constants";

function makeOptions(
  overrides: Partial<Parameters<typeof useCanvasKeyboardShortcuts>[0]> = {},
) {
  return {
    selectedImportId: null,
    allImportsSelected: false,
    selectedGroupId: null,
    toolpathSelected: false,
    isJobActive: false,
    selectGroup: vi.fn(),
    selectImport: vi.fn(),
    removeImport: vi.fn(),
    clearImports: vi.fn(),
    selectToolpath: vi.fn(),
    setGcodeToolpath: vi.fn(),
    zoomBy: vi.fn(),
    fitToView: vi.fn(),
    setSpacePressed: vi.fn(),
    ...overrides,
  };
}

describe("useCanvasKeyboardShortcuts", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      imports: [],
      layerGroups: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets space pressed on Space keydown and clears on keyup", () => {
    const opts = makeOptions();
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
      );
    });
    expect(opts.setSpacePressed).toHaveBeenCalledWith(true);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", { code: "Space", bubbles: true }),
      );
    });
    expect(opts.setSpacePressed).toHaveBeenCalledWith(false);
  });

  it("ignores shortcuts when target is an input", () => {
    const opts = makeOptions({ selectedImportId: "imp-1" });
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
    );

    expect(opts.removeImport).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("Delete removes selected import", () => {
    const opts = makeOptions({ selectedImportId: "imp-1" });
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );
    });

    expect(opts.removeImport).toHaveBeenCalledWith("imp-1");
  });

  it("Delete clears all imports when allImportsSelected", () => {
    const opts = makeOptions({ allImportsSelected: true });
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );
    });

    expect(opts.clearImports).toHaveBeenCalledTimes(1);
  });

  it("Delete removes selected group imports and clears group selection", () => {
    const storeRemoveImport = vi.fn();
    useCanvasStore.setState({
      imports: [
        { id: "a" } as never,
        { id: "b" } as never,
        { id: "c" } as never,
      ],
      layerGroups: [{ id: "g1", importIds: ["a", "b"] } as never],
      removeImport: storeRemoveImport as never,
    });

    const opts = makeOptions({ selectedGroupId: "g1" });
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
      );
    });

    expect(storeRemoveImport).toHaveBeenCalledWith("a");
    expect(storeRemoveImport).toHaveBeenCalledWith("b");
    expect(opts.selectGroup).toHaveBeenCalledWith(null);
  });

  it("Delete clears toolpath when selected and no active job", () => {
    const opts = makeOptions({ toolpathSelected: true, isJobActive: false });
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );
    });

    expect(opts.setGcodeToolpath).toHaveBeenCalledWith(null);
  });

  it("Delete does not clear toolpath while job is active", () => {
    const opts = makeOptions({ toolpathSelected: true, isJobActive: true });
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );
    });

    expect(opts.setGcodeToolpath).not.toHaveBeenCalled();
  });

  it("Escape deselects import and toolpath", () => {
    const opts = makeOptions();
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(opts.selectImport).toHaveBeenCalledWith(null);
    expect(opts.selectToolpath).toHaveBeenCalledWith(false);
  });

  it("Ctrl+Shift+= zooms in and Ctrl+Shift+- zooms out", () => {
    const opts = makeOptions();
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "=",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "-",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    expect(opts.zoomBy).toHaveBeenCalledWith(ZOOM_STEP);
    expect(opts.zoomBy).toHaveBeenCalledWith(1 / ZOOM_STEP);
  });

  it("Ctrl+0 calls fitToView", () => {
    const opts = makeOptions();
    renderHook(() => useCanvasKeyboardShortcuts(opts));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "0",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(opts.fitToView).toHaveBeenCalledTimes(1);
  });

  it("cleans up key listeners on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const opts = makeOptions();

    const { unmount } = renderHook(() => useCanvasKeyboardShortcuts(opts));
    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("keyup", expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("keyup", expect.any(Function));
  });
});
