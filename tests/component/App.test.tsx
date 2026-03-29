import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMachineStore } from "@renderer/store/machineStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { useConsoleStore } from "@renderer/store/consoleStore";
import App from "@renderer/App";
import { createMachineConfig } from "../helpers/factories";

beforeEach(() => {
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
  });
  useCanvasStore.setState({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    gcodeToolpath: null,
  });
  useTaskStore.setState({ tasks: {} });
  useConsoleStore.setState({ lines: [], maxLines: 500 });
  vi.clearAllMocks();

  // App calls getMachineConfigs on mount
  (
    window.terraForge.config.getMachineConfigs as ReturnType<typeof vi.fn>
  ).mockResolvedValue([]);
});

describe("App", () => {
  it("renders without crashing", async () => {
    const { container } = render(<App />);
    await act(async () => {});
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders the Toolbar brand", async () => {
    render(<App />);
    await act(async () => {});
    expect(
      document.querySelector('[aria-label="terraForge"]'),
    ).toBeInTheDocument();
  });

  it("renders the File Browser panel", async () => {
    render(<App />);
    await act(async () => {});
    expect(screen.getByText("File Browser")).toBeInTheDocument();
  });

  it("renders the Properties panel", async () => {
    render(<App />);
    await act(async () => {});
    expect(screen.getByText("Properties")).toBeInTheDocument();
  });

  it("subscribes to IPC channels on mount", async () => {
    render(<App />);
    await act(async () => {});
    expect(window.terraForge.config.getMachineConfigs).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.onStatusUpdate).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.onConsoleMessage).toHaveBeenCalled();
    expect(window.terraForge.serial.onData).toHaveBeenCalled();
    expect(window.terraForge.tasks.onTaskUpdate).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.onPing).toHaveBeenCalled();
  });

  // ── Configs loaded on mount ────────────────────────────────────────────

  it("populates store with configs loaded on mount", async () => {
    const cfg = createMachineConfig({ name: "Loaded Plotter" });
    (
      window.terraForge.config.getMachineConfigs as ReturnType<typeof vi.fn>
    ).mockResolvedValue([cfg]);
    render(<App />);
    await waitFor(() => {
      expect(useMachineStore.getState().configs).toHaveLength(1);
      expect(useMachineStore.getState().configs[0].name).toBe("Loaded Plotter");
    });
  });

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  it("calls cleanup callbacks returned by IPC subscriptions on unmount", () => {
    const unsubStatus = vi.fn();
    const unsubConsole = vi.fn();
    const unsubSerial = vi.fn();
    const unsubTasks = vi.fn();
    const unsubPing = vi.fn();

    (
      window.terraForge.fluidnc.onStatusUpdate as ReturnType<typeof vi.fn>
    ).mockReturnValue(unsubStatus);
    (
      window.terraForge.fluidnc.onConsoleMessage as ReturnType<typeof vi.fn>
    ).mockReturnValue(unsubConsole);
    (
      window.terraForge.serial.onData as ReturnType<typeof vi.fn>
    ).mockReturnValue(unsubSerial);
    (
      window.terraForge.tasks.onTaskUpdate as ReturnType<typeof vi.fn>
    ).mockReturnValue(unsubTasks);
    (
      window.terraForge.fluidnc.onPing as ReturnType<typeof vi.fn>
    ).mockReturnValue(unsubPing);

    const { unmount } = render(<App />);
    unmount();

    expect(unsubStatus).toHaveBeenCalled();
    expect(unsubConsole).toHaveBeenCalled();
    expect(unsubSerial).toHaveBeenCalled();
    expect(unsubTasks).toHaveBeenCalled();
    expect(unsubPing).toHaveBeenCalled();
  });

  // ── onFirmwareInfo ─────────────────────────────────────────────────────────

  it("subscribes to onFirmwareInfo on mount", async () => {
    render(<App />);
    await act(async () => {});
    expect(window.terraForge.fluidnc.onFirmwareInfo).toHaveBeenCalled();
  });

  it("calls onFirmwareInfo cleanup on unmount", () => {
    const unsubFirmware = vi.fn();
    (
      window.terraForge.fluidnc.onFirmwareInfo as ReturnType<typeof vi.fn>
    ).mockReturnValue(unsubFirmware);
    const { unmount } = render(<App />);
    unmount();
    expect(unsubFirmware).toHaveBeenCalled();
  });

  // ── Ping watchdog ──────────────────────────────────────────────────────────

  it("ping callback sets wsLive=true", async () => {
    let pingCb: (() => void) | null = null;
    (
      window.terraForge.fluidnc.onPing as ReturnType<typeof vi.fn>
    ).mockImplementation((cb: () => void) => {
      pingCb = cb;
      return () => {};
    });
    useMachineStore.setState({ wsLive: false });
    render(<App />);
    await act(async () => {});
    act(() => {
      pingCb?.();
    });
    expect(useMachineStore.getState().wsLive).toBe(true);
  });

  // ── Jog panel ─────────────────────────────────────────────────────────────

  it("jog panel is visible by default (drag handle rendered)", async () => {
    render(<App />);
    await act(async () => {});
    expect(screen.getByTitle("Drag to move")).toBeInTheDocument();
  });

  it("closing jog panel hides the drag handle", async () => {
    render(<App />);
    await act(async () => {});
    const closeBtn = screen.getByText("✕");
    await userEvent.click(closeBtn);
    expect(screen.queryByTitle("Drag to move")).not.toBeInTheDocument();
  });

  // ── Jog drag ──────────────────────────────────────────────────────────────

  it("dragging the jog handle updates panel position", async () => {
    render(<App />);
    await act(async () => {});

    const dragHandle = screen.getByTitle("Drag to move");
    const jogPanel = dragHandle.parentElement!;

    // jsdom does not implement setPointerCapture; stub it on the drag handle element
    dragHandle.setPointerCapture = vi.fn();

    await act(async () => {
      fireEvent.pointerDown(dragHandle, {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      });
      fireEvent.pointerMove(jogPanel, {
        clientX: 120,
        clientY: 110,
        pointerId: 1,
      });
      fireEvent.pointerUp(jogPanel, { pointerId: 1 });
    });

    // After drag, the panel should have explicit position style set (left/top from setJogPos)
    expect(jogPanel.getAttribute("style")).toMatch(/left/);
  });
});
