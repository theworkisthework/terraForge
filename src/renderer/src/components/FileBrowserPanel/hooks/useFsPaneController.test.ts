import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFsPaneController } from "./useFsPaneController";
import { useTaskStore } from "../../../store/taskStore";
import { useCanvasStore } from "../../../store/canvasStore";

const file = { name: "job.gcode", path: "/job.gcode", size: 10, isDirectory: false };
let consoleListener: ((msg: string) => void) | null;
const fluidnc = {
  fetchFileText: vi.fn(),
  runFile: vi.fn(),
  onConsoleMessage: vi.fn((cb: (msg: string) => void) => {
    consoleListener = cb;
    return () => {};
  }),
};
const labels = () => vi.mocked(upsertTask).mock.calls.map(([t]) => `${t.status}: ${t.label}`);
const upsertTask = vi.fn();

function setup() {
  const listFn = vi.fn().mockResolvedValue([file]);
  const hook = renderHook(() =>
    useFsPaneController({
      label: "sdcard",
      connected: true,
      serialMode: false,
      source: "sd",
      listFn,
      deleteFn: vi.fn(),
      uploadFn: vi.fn(),
      upsertTask,
    }),
  );
  return { ...hook, listFn };
}

beforeEach(() => {
  consoleListener = null;
  upsertTask.mockReset();
  fluidnc.fetchFileText.mockReset();
  fluidnc.runFile.mockReset();
  vi.stubGlobal("terraForge", { fluidnc, fs: {} });
  useTaskStore.setState({ tasks: {} });
  useCanvasStore.setState({ gcodeToolpath: null, gcodeSource: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useFsPaneController", () => {
  it("reports a preview that cannot be fetched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fluidnc.fetchFileText.mockRejectedValue(new Error("gone"));
    const { result } = setup();
    await act(async () => {
      await result.current.doPreview(file);
    });
    expect(labels()).toEqual(["running: Loading preview for job.gcode…", "error: Preview failed"]);
    expect(result.current.previewing).toBeNull();
  });

  it("still starts a job whose preview failed, and reports a job that will not start", async () => {
    vi.useFakeTimers();
    fluidnc.fetchFileText.mockRejectedValue(new Error("gone"));
    fluidnc.runFile.mockRejectedValue(new Error("busy"));
    const { result } = setup();
    await act(async () => {
      const run = result.current.doRun(file);
      await vi.advanceTimersByTimeAsync(1000);
      await run;
    });
    expect(labels()).toEqual([
      "running: Starting job.gcode…",
      "running: Loading preview for job.gcode…",
      "error: Preview load failed",
      "error: Failed to start job.gcode",
    ]);
    expect(fluidnc.runFile).toHaveBeenCalledWith("/job.gcode", "sd");
    expect(result.current.activeJobPath).toBeNull();
  });

  it("re-lists when the machine reports files changed, but not mid-transfer", async () => {
    const { listFn } = setup();
    await waitFor(() => expect(listFn).toHaveBeenCalledTimes(1));
    await act(async () => consoleListener?.("[MSG:Something else]"));
    expect(listFn).toHaveBeenCalledTimes(1);
    await act(async () => consoleListener?.("[MSG:Files changed]"));
    await waitFor(() => expect(listFn).toHaveBeenCalledTimes(2));

    act(() => useTaskStore.setState({ tasks: { t: { id: "t", type: "file-upload", label: "", progress: 5, status: "running" } } }));
    await act(async () => consoleListener?.("[MSG:Files changed]"));
    expect(listFn).toHaveBeenCalledTimes(2);
    // Once the transfer finishes, the deferred refresh runs.
    act(() => useTaskStore.setState({ tasks: {} }));
    await waitFor(() => expect(listFn).toHaveBeenCalledTimes(3));
  });

  it("refuses to start another transfer or a job while one is running", async () => {
    useTaskStore.setState({ tasks: { t: { id: "t", type: "file-download", label: "", progress: 5, status: "running" } } });
    const { result } = setup();
    await act(async () => {
      result.current.handleRun(file);
      await result.current.handleUpload();
      await result.current.handleDownload(file);
    });
    expect(upsertTask).not.toHaveBeenCalled();
    expect(fluidnc.runFile).not.toHaveBeenCalled();
  });
});
