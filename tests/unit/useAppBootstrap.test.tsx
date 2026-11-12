/**
 * Tests for useAppBootstrap's handling of a lost serial connection.
 *
 * The main process reports a USB port that closed on its own through
 * `serial.onDisconnected`; the app must stop showing the machine as
 * connected and say why.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useAppBootstrap } from "@renderer/hooks/useAppBootstrap";
import { useMachineStore } from "@renderer/store/machineStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { createSvgImport } from "../helpers/factories";

function BootstrapHost() {
  useAppBootstrap();
  return null;
}

/** Mounts the hook and returns what it registered with `onDisconnected`. */
function mountAndCaptureLossHandler() {
  let onLost: ((reason: string) => void) | undefined;
  const unsubscribe = vi.fn();
  (
    window.terraForge.serial.onDisconnected as ReturnType<typeof vi.fn>
  ).mockImplementationOnce((cb: (reason: string) => void) => {
    onLost = cb;
    return unsubscribe;
  });
  const view = render(<BootstrapHost />);
  return { lose: (reason: string) => act(() => onLost!(reason)), unsubscribe, view };
}

beforeEach(() => {
  useMachineStore.setState({ connected: false, wsLive: false, fwInfo: null });
  useTaskStore.setState({ tasks: {} });
  vi.clearAllMocks();
});

describe("useAppBootstrap — serial connection lost", () => {
  it("marks the machine disconnected and shows why", () => {
    const { lose } = mountAndCaptureLossHandler();
    useMachineStore.setState({ connected: true });

    lose("device unplugged");

    expect(useMachineStore.getState().connected).toBe(false);
    const tasks = Object.values(useTaskStore.getState().tasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      status: "error",
      label: "Serial connection lost",
      error: "device unplugged",
    });
  });

  it("stops listening when the app unmounts", () => {
    const { unsubscribe, view } = mountAndCaptureLossHandler();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useAppBootstrap — unsaved changes", () => {
  const reported = () =>
    (window.terraForge.app.setUnsavedChanges as ReturnType<typeof vi.fn>).mock.calls.map(([unsaved]) => unsaved);

  beforeEach(() => {
    useCanvasStore.getState().commitGesture();
    useCanvasStore.setState({ imports: [], layerGroups: [], undoStack: [], redoStack: [], revision: 0, savedRevision: 0 });
  });

  it("tells the main process when the layout changes and when it is saved", () => {
    render(<BootstrapHost />);
    expect(reported()).toEqual([false]);

    act(() => useCanvasStore.getState().addImport(createSvgImport()));
    expect(reported()).toEqual([false, true]);

    // Further edits are no news.
    act(() => useCanvasStore.getState().updateImport(useCanvasStore.getState().imports[0].id, { x: 40 }));
    expect(reported()).toEqual([false, true]);

    act(() => useCanvasStore.getState().markSaved());
    expect(reported()).toEqual([false, true, false]);
  });

  it("reports nothing to lose once the canvas is cleared", () => {
    render(<BootstrapHost />);
    act(() => useCanvasStore.getState().addImport(createSvgImport()));
    act(() => useCanvasStore.getState().clearImports());
    expect(reported()).toEqual([false, true, false]);
  });
});
