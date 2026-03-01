import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  it("renders without crashing", () => {
    const { container } = render(<App />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders the Toolbar brand", () => {
    render(<App />);
    expect(screen.getByText("terraForge")).toBeInTheDocument();
  });

  it("renders the File Browser panel", () => {
    render(<App />);
    expect(screen.getByText("File Browser")).toBeInTheDocument();
  });

  it("renders the Properties panel", () => {
    render(<App />);
    expect(screen.getByText("Properties")).toBeInTheDocument();
  });

  it("subscribes to IPC channels on mount", () => {
    render(<App />);
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
      expect(useMachineStore.getState().configs[0].name).toBe(
        "Loaded Plotter",
      );
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
});
