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
