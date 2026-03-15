import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMachineStore } from "@renderer/store/machineStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { JobControls } from "@renderer/components/JobControls";

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
    gcodeToolpath: null,
    gcodeSource: null,
    toolpathSelected: false,
  });
  useTaskStore.setState({ tasks: {} });
  vi.clearAllMocks();
});

describe("JobControls", () => {
  it("renders the Job heading", () => {
    render(<JobControls />);
    expect(screen.getByText("Job")).toBeInTheDocument();
  });

  it("shows 'no file selected' placeholder when no job file", () => {
    render(<JobControls />);
    expect(screen.getByText(/No file selected/i)).toBeInTheDocument();
  });

  it("shows selected file name when a job file is set", () => {
    useMachineStore.setState({
      selectedJobFile: {
        path: "/test.gcode",
        source: "sd",
        name: "test.gcode",
      },
    });
    render(<JobControls />);
    expect(screen.getByText(/test\.gcode/)).toBeInTheDocument();
  });

  it("shows warning for non-gcode file", () => {
    useMachineStore.setState({
      selectedJobFile: { path: "/photo.png", source: "sd", name: "photo.png" },
    });
    render(<JobControls />);
    expect(screen.getByText(/not a G-code file/i)).toBeInTheDocument();
  });

  it("disables start button when not connected", () => {
    useMachineStore.setState({
      connected: false,
      selectedJobFile: {
        path: "/test.gcode",
        source: "sd",
        name: "test.gcode",
      },
    });
    render(<JobControls />);
    const btn = screen.getByText("▶ Start job");
    expect(btn).toBeDisabled();
  });

  it("shows progress bar when state is Run", () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        lineNum: 50,
        lineTotal: 200,
        raw: "<Run|MPos:0,0,0|Ln:50/200>",
      },
    });
    render(<JobControls />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });

  it("shows Pause button when running", () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
      },
    });
    render(<JobControls />);
    expect(screen.getByText("⏸ Pause")).toBeInTheDocument();
  });

  it("shows Resume button when held", () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Hold",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Hold|MPos:0,0,0>",
      },
    });
    render(<JobControls />);
    expect(screen.getByText("▶ Resume")).toBeInTheDocument();
    expect(screen.getByText(/Paused/)).toBeInTheDocument();
  });

  it("shows Abort button when job is active", () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
      },
    });
    render(<JobControls />);
    expect(screen.getByText("✕ Abort")).toBeInTheDocument();
  });

  it("calls pauseJob when Pause clicked", async () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
      },
    });
    render(<JobControls />);
    await userEvent.click(screen.getByText("⏸ Pause"));
    expect(window.terraForge.fluidnc.pauseJob).toHaveBeenCalled();
  });

  it("calls resumeJob when Resume clicked", async () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Hold",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Hold|MPos:0,0,0>",
      },
    });
    render(<JobControls />);
    await userEvent.click(screen.getByText("▶ Resume"));
    expect(window.terraForge.fluidnc.resumeJob).toHaveBeenCalled();
  });

  it("shows local file indicator with upload note", () => {
    useMachineStore.setState({
      connected: true,
      selectedJobFile: {
        path: "C:\\files\\art.gcode",
        source: "local",
        name: "art.gcode",
      },
    });
    render(<JobControls />);
    expect(screen.getByText(/art\.gcode/)).toBeInTheDocument();
    expect(screen.getByText(/will upload/)).toBeInTheDocument();
  });

  // ── Start job (SD file) ─────────────────────────────────────────────────

  it("starts SD job via runFile when Start clicked", async () => {
    useMachineStore.setState({
      connected: true,
      selectedJobFile: {
        path: "/test.gcode",
        source: "sd",
        name: "test.gcode",
      },
    });
    render(<JobControls />);
    await userEvent.click(screen.getByText("▶ Start job"));
    expect(window.terraForge.fluidnc.runFile).toHaveBeenCalledWith(
      "/test.gcode",
      "sd",
    );
  });

  // ── Start job (local file) ──────────────────────────────────────────────

  it("uploads then runs when starting a local file", async () => {
    useMachineStore.setState({
      connected: true,
      selectedJobFile: {
        path: "C:\\files\\art.gcode",
        source: "local",
        name: "art.gcode",
      },
    });
    (
      window.terraForge.fluidnc.uploadFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    render(<JobControls />);
    await userEvent.click(screen.getByText("▶ Start job"));
    expect(window.terraForge.fluidnc.uploadFile).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.runFile).toHaveBeenCalledWith(
      "/art.gcode",
      "sd",
    );
  });

  // ── Abort with confirm ──────────────────────────────────────────────────

  it("calls abortJob when Abort confirmed", async () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
      },
    });
    render(<JobControls />);
    await userEvent.click(screen.getByText("✕ Abort"));
    // Themed confirm dialog should appear
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Abort" }));
    expect(window.terraForge.fluidnc.abortJob).toHaveBeenCalled();
  });

  it("does not abort when confirm is cancelled", async () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
      },
    });
    render(<JobControls />);
    await userEvent.click(screen.getByText("✕ Abort"));
    // Themed confirm dialog should appear
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.terraForge.fluidnc.abortJob).not.toHaveBeenCalled();
  });

  // ── Indeterminate progress ──────────────────────────────────────────────

  it("shows indeterminate pulse when running but no line info", () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
      },
    });
    render(<JobControls />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    // No line count → indeterminate pulse bar
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("start button disabled when no valid gcode file selected", () => {
    useMachineStore.setState({
      connected: true,
      selectedJobFile: {
        path: "/photo.png",
        source: "sd",
        name: "photo.png",
      },
    });
    render(<JobControls />);
    expect(screen.getByText("▶ Start job")).toBeDisabled();
  });

  // ── Canvas toolpath selection ───────────────────────────────────────────

  it("enables Start Job when toolpath is selected on canvas with a local gcodeSource", () => {
    useMachineStore.setState({ connected: true, selectedJobFile: null });
    useCanvasStore.setState({
      toolpathSelected: true,
      gcodeSource: {
        path: "C:\\files\\art.gcode",
        name: "art.gcode",
        source: "local" as const,
      },
    });
    render(<JobControls />);
    expect(screen.getByText("▶ Start job")).not.toBeDisabled();
  });

  it("shows canvas toolpath file name in indicator when toolpath selected with no explicit job file", () => {
    useMachineStore.setState({ connected: true, selectedJobFile: null });
    useCanvasStore.setState({
      toolpathSelected: true,
      gcodeSource: {
        path: "C:\\files\\art.gcode",
        name: "art.gcode",
        source: "local" as const,
      },
    });
    render(<JobControls />);
    expect(screen.getByText(/art\.gcode/)).toBeInTheDocument();
    expect(screen.getByText(/will upload/)).toBeInTheDocument();
  });

  it("Start Job remains disabled when toolpath not selected and no job file set", () => {
    useMachineStore.setState({ connected: true, selectedJobFile: null });
    useCanvasStore.setState({
      toolpathSelected: false,
      gcodeSource: {
        path: "C:\\files\\art.gcode",
        name: "art.gcode",
        source: "local" as const,
      },
    });
    render(<JobControls />);
    expect(screen.getByText("▶ Start job")).toBeDisabled();
  });

  it("uploads then runs canvas-selected local toolpath when Start clicked", async () => {
    useMachineStore.setState({ connected: true, selectedJobFile: null });
    useCanvasStore.setState({
      toolpathSelected: true,
      gcodeSource: {
        path: "C:\\files\\art.gcode",
        name: "art.gcode",
        source: "local" as const,
      },
    });
    (
      window.terraForge.fluidnc.uploadFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    render(<JobControls />);
    await userEvent.click(screen.getByText("▶ Start job"));
    expect(window.terraForge.fluidnc.uploadFile).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.runFile).toHaveBeenCalledWith(
      "/art.gcode",
      "sd",
    );
  });
});
