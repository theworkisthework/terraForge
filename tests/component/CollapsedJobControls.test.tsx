/**
 * The job buttons on the collapsed file browser: what the main button does
 * in each job state, when it is disabled, and the progress readout.
 */
import { render, screen, act, fireEvent } from "@testing-library/react";
import { CollapsedJobControls } from "@renderer/components/JobControls";
import { useMachineStore } from "@renderer/store/machineStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import type { MachineStatus } from "../../src/types";

const status = (state: string, lines: Partial<MachineStatus> = {}) =>
  ({ raw: "", state, mpos: { x: 0, y: 0, z: 0 }, wpos: { x: 0, y: 0, z: 0 }, ...lines }) as MachineStatus;

beforeEach(() => {
  vi.clearAllMocks();
  useMachineStore.setState({ connected: true, status: status("Idle"), selectedJobFile: null });
  useCanvasStore.setState({ gcodeToolpath: null, gcodeSource: null, toolpathSelected: false, gcodePreviewLoading: false });
});

async function click(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByLabelText(label));
  });
}

describe("CollapsedJobControls", () => {
  it("resumes a held job", async () => {
    useMachineStore.setState({ status: status("Hold") });
    render(<CollapsedJobControls onAbort={() => {}} />);
    await click("Resume job");
    expect(window.terraForge.fluidnc.resumeJob).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.pauseJob).not.toHaveBeenCalled();
  });

  it("starts the selected toolpath's file when no job file is chosen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useCanvasStore.setState({ toolpathSelected: true, gcodeSource: { path: "/plot.nc", name: "plot.nc", source: "sd" } });
    render(<CollapsedJobControls onAbort={() => {}} />);
    await click("Start job");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(window.terraForge.fluidnc.runFile).toHaveBeenCalledWith("/plot.nc", "sd");
    vi.useRealTimers();
  });

  it("can't start a file that isn't G-code, or while its preview loads", () => {
    useMachineStore.setState({ selectedJobFile: { path: "/notes.txt", name: "notes.txt", source: "fs" } });
    const { rerender } = render(<CollapsedJobControls onAbort={() => {}} />);
    expect(screen.getByLabelText("Start job")).toBeDisabled();
    expect(screen.getByLabelText("Start job")).toHaveAttribute("title", "Select a G-code file to start");

    act(() => {
      useMachineStore.setState({ selectedJobFile: { path: "/a.gcode", name: "a.gcode", source: "sd" } });
      useCanvasStore.setState({ gcodePreviewLoading: true });
    });
    rerender(<CollapsedJobControls onAbort={() => {}} />);
    expect(screen.getByLabelText("Start job")).toBeDisabled();
    expect(screen.getByLabelText("Start job")).toHaveAttribute("title", "Start job");
  });

  it("asks before aborting", async () => {
    useMachineStore.setState({ status: status("Run") });
    const onAbort = vi.fn();
    render(<CollapsedJobControls onAbort={onAbort} />);
    await click("Abort job");
    expect(onAbort).toHaveBeenCalledOnce();
    expect(window.terraForge.fluidnc.abortJob).not.toHaveBeenCalled();
  });

  it("shows the line and percentage while running, or that progress is pending", () => {
    useMachineStore.setState({
      status: status("Run", { lineNum: 1500, lineTotal: 6000 }),
      selectedJobFile: { path: "/a.gcode", name: "a.gcode", source: "sd" },
    });
    const { rerender } = render(<CollapsedJobControls onAbort={() => {}} />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText(`line ${(1500).toLocaleString()} / ${(6000).toLocaleString()} (25%)`)).toBeInTheDocument();

    act(() => useMachineStore.setState({ status: status("Hold") }));
    rerender(<CollapsedJobControls onAbort={() => {}} />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("Progress pending...")).toBeInTheDocument();
  });
});
