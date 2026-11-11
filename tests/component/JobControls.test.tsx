import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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

afterEach(() => {
  vi.useRealTimers();
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
    const btn = screen.getByText("Start job");
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
    expect(screen.getByText("Pause")).toBeInTheDocument();
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
    expect(screen.getByText("Resume")).toBeInTheDocument();
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
    expect(screen.getByText("Abort")).toBeInTheDocument();
  });

  it("keeps active controls visible through a brief Idle blip", async () => {
    vi.useFakeTimers();
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
    expect(screen.getByText("Pause")).toBeInTheDocument();

    act(() => {
      useMachineStore.setState({
        status: {
          state: "Idle",
          mpos: { x: 0, y: 0, z: 0 },
          wpos: { x: 0, y: 0, z: 0 },
          raw: "<Idle|MPos:0,0,0>",
        },
      });
    });

    expect(screen.getByText("Pause")).toBeInTheDocument();
    expect(screen.queryByText("Start job")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Pause")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText("Start job")).toBeInTheDocument();
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
    await userEvent.click(screen.getByText("Pause"));
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
    await userEvent.click(screen.getByText("Resume"));
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
    await userEvent.click(screen.getByText("Start job"));
    // fetchFileText + 600ms cosmetic pause precede runFile — wait for it
    await waitFor(
      () =>
        expect(window.terraForge.fluidnc.runFile).toHaveBeenCalledWith(
          "/test.gcode",
          "sd",
        ),
      { timeout: 2000 },
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
    await userEvent.click(screen.getByText("Start job"));
    expect(window.terraForge.fluidnc.uploadFile).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.runFile).toHaveBeenCalledWith(
      "/art.gcode",
      "sd",
    );
  });

  it("does not run the job when the upload fails", async () => {
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
    ).mockRejectedValueOnce(new Error("HTTP 500"));
    render(<JobControls />);
    await userEvent.click(screen.getByText("Start job"));

    await waitFor(() => {
      const tasks = Object.values(useTaskStore.getState().tasks);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        type: "file-upload",
        status: "error",
        label: "Upload failed: art.gcode",
      });
    });
    // An older art.gcode may already be on the SD card; it must not be run.
    expect(window.terraForge.fluidnc.runFile).not.toHaveBeenCalled();
  });

  it("does not run the job when the upload is cancelled", async () => {
    useMachineStore.setState({
      connected: true,
      selectedJobFile: {
        path: "C:\\files\\art.gcode",
        source: "local",
        name: "art.gcode",
      },
    });
    // The main process marks the task cancelled, then rejects the upload.
    (
      window.terraForge.fluidnc.uploadFile as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(async (taskId: string) => {
      useTaskStore.getState().upsertTask({
        id: taskId,
        type: "file-upload",
        label: "Uploading /art.gcode",
        progress: 40,
        status: "cancelled",
      });
      throw new Error("Transfer cancelled");
    });
    render(<JobControls />);
    await userEvent.click(screen.getByText("Start job"));

    await waitFor(() =>
      expect(window.terraForge.fluidnc.uploadFile).toHaveBeenCalled(),
    );
    expect(window.terraForge.fluidnc.runFile).not.toHaveBeenCalled();
    // The toast keeps saying "cancelled" rather than turning into an error.
    const tasks = Object.values(useTaskStore.getState().tasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("cancelled");
  });

  it("reports a job that uploaded but would not start as a start failure", async () => {
    useMachineStore.setState({
      connected: true,
      selectedJobFile: {
        path: "C:\\files\\art.gcode",
        source: "local",
        name: "art.gcode",
      },
    });
    (
      window.terraForge.fluidnc.runFile as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("machine busy"));
    render(<JobControls />);
    await userEvent.click(screen.getByText("Start job"));

    await waitFor(() => {
      const failed = Object.values(useTaskStore.getState().tasks).find(
        (t) => t.status === "error",
      );
      expect(failed).toMatchObject({
        type: "job-start",
        label: "Failed to start art.gcode",
        error: expect.stringContaining("machine busy"),
      });
    });
  });

  // ── Job controls that could not be sent ─────────────────────────────────

  it("shows an error when Pause could not be sent", async () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
      },
    });
    (
      window.terraForge.fluidnc.pauseJob as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("Not connected"));
    render(<JobControls />);
    await userEvent.click(screen.getByText("Pause"));

    await waitFor(() => {
      const tasks = Object.values(useTaskStore.getState().tasks);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        type: "job-control",
        status: "error",
        label: expect.stringContaining("Pause was not sent"),
        error: "Not connected",
      });
    });
  });

  it("shows an error when Abort could not be sent", async () => {
    useMachineStore.setState({
      connected: true,
      status: {
        state: "Run",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
      },
    });
    (
      window.terraForge.fluidnc.abortJob as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("fetch failed"));
    render(<JobControls />);
    await userEvent.click(screen.getByText("Abort"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Abort" }));

    await waitFor(() => {
      const tasks = Object.values(useTaskStore.getState().tasks);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        status: "error",
        label: expect.stringContaining("Abort was not sent"),
        error: "fetch failed",
      });
    });
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
    await userEvent.click(screen.getByText("Abort"));
    // Themed confirm dialog should appear
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Abort" }));
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
    await userEvent.click(screen.getByText("Abort"));
    // Themed confirm dialog should appear
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
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
    expect(screen.getByText("Start job")).toBeDisabled();
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
    expect(screen.getByText("Start job")).not.toBeDisabled();
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
    expect(screen.getByText("Start job")).toBeDisabled();
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
    await userEvent.click(screen.getByText("Start job"));
    expect(window.terraForge.fluidnc.uploadFile).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.runFile).toHaveBeenCalledWith(
      "/art.gcode",
      "sd",
    );
  });
});
