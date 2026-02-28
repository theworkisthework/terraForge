import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useMachineStore } from "@renderer/store/machineStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { useConsoleStore } from "@renderer/store/consoleStore";
import App from "@renderer/App";

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
});
