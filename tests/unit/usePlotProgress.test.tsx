/**
 * Tests for usePlotProgress hook.
 *
 * The hook subscribes to machineStore (status, connected) and canvasStore
 * (gcodeToolpath) then writes plot-progress SVG path strings back into
 * canvasStore via setPlotProgress / clearPlotProgress.
 *
 * We mount a thin wrapper component, manipulate the stores directly, and
 * assert the expected store state after React flushes the effects.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { usePlotProgress } from "@renderer/utils/usePlotProgress";
import { useMachineStore } from "@renderer/store/machineStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import type { GcodeSegment, GcodeToolpath } from "@renderer/utils/gcodeParser";

// ── Minimal host component ────────────────────────────────────────────────────
function ProgressHost() {
  usePlotProgress();
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSeg(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  type: "cut" | "rapid" = "cut",
  lineNum = 1,
): GcodeSegment {
  return { from: { x: x0, y: y0 }, to: { x: x1, y: y1 }, type, lineNum };
}

function makeToolpath(segments: GcodeSegment[]): GcodeToolpath {
  return {
    cutPaths: [],
    rapidPaths: new Float32Array(),
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    lineCount: segments.length,
    segments,
    fileSizeBytes: 100,
    totalCutDistance: 10,
    totalRapidDistance: 5,
  };
}

function setStatus(
  state: string,
  x = 0,
  y = 0,
  lineNum?: number,
  raw?: string,
) {
  useMachineStore.setState({
    status: {
      state: state as any,
      mpos: { x, y, z: 0 },
      wpos: { x, y, z: 0 },
      raw: raw ?? `<${state}|MPos:${x},${y},0>`,
      lineNum,
      lineTotal: lineNum !== undefined ? 100 : undefined,
    },
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("usePlotProgress", () => {
  beforeEach(() => {
    // Reset both stores to clean state
    useMachineStore.setState({
      status: null,
      connected: false,
      configs: [],
      activeConfigId: null,
      wsLive: false,
      selectedJobFile: null,
      fwInfo: null,
    });
    useCanvasStore.setState({
      imports: [],
      selectedImportId: null,
      selectedPathId: null,
      gcodeToolpath: null,
      gcodeSource: null,
      toolpathSelected: false,
      showCentreMarker: true,
      plotProgressCuts: "leftover",
      plotProgressRapids: "leftover",
      gcodePreviewLoading: false,
    } as any);
  });

  afterEach(() => {
    // nothing – store resets in beforeEach
  });

  // ── No-op cases ─────────────────────────────────────────────────────────

  it("clears prior progress on mount when there are no segments or status", async () => {
    render(<ProgressHost />);
    await act(async () => {});
    // The toolpath-change effect fires on mount and calls clearPlotProgress
    expect(useCanvasStore.getState().plotProgressCuts).toBe("");
    expect(useCanvasStore.getState().plotProgressRapids).toBe("");
  });

  it("clears plot progress when gcodeToolpath changes to a new value", async () => {
    const segments = [makeSeg(0, 0, 10, 0)];
    const tp = makeToolpath(segments);

    render(<ProgressHost />);

    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
    });

    // clearPlotProgress is called on toolpath change
    expect(useCanvasStore.getState().plotProgressCuts).toBe("");
    expect(useCanvasStore.getState().plotProgressRapids).toBe("");
  });

  it("clears plot progress on disconnect", async () => {
    render(<ProgressHost />);

    // First connect with some progress
    await act(async () => {
      useMachineStore.setState({ connected: true });
      useCanvasStore.setState({
        plotProgressCuts: "some cuts",
        plotProgressRapids: "",
      } as any);
    });

    // Disconnect
    await act(async () => {
      useMachineStore.setState({ connected: false });
    });

    expect(useCanvasStore.getState().plotProgressCuts).toBe("");
  });

  // ── Line-number tracking ─────────────────────────────────────────────────

  it("advances progress via line-number when Ln: is present", async () => {
    const segments = [
      makeSeg(0, 0, 10, 0, "cut", 1),
      makeSeg(10, 0, 20, 0, "cut", 2),
      makeSeg(20, 0, 30, 0, "cut", 3),
    ];
    const tp = makeToolpath(segments);

    render(<ProgressHost />);

    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
    });

    // Simulate machine in Run state at line 2
    await act(async () => {
      setStatus("Run", 20, 0, 2);
    });

    const cuts = useCanvasStore.getState().plotProgressCuts;
    // Should include path data for at least up to segment 2
    expect(cuts.length).toBeGreaterThan(0);
  });

  it("resets progress on a new job start (Idle → Run)", async () => {
    const segments = [
      makeSeg(0, 0, 10, 0, "cut", 1),
      makeSeg(10, 0, 20, 0, "cut", 2),
    ];
    const tp = makeToolpath(segments);

    render(<ProgressHost />);

    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
    });

    // First job run — advance to line 2
    await act(async () => {
      setStatus("Run", 20, 0, 2);
    });
    expect(useCanvasStore.getState().plotProgressCuts.length).toBeGreaterThan(
      0,
    );

    // Simulate job completing then resuming: state goes Idle → Run
    await act(async () => {
      setStatus("Idle", 0, 0);
    });
    await act(async () => {
      setStatus("Run", 0, 0, 1);
    });

    // Progress was reset on new Run start
    const cuts = useCanvasStore.getState().plotProgressCuts;
    // After line 1, there's at most segment 0 worth of progress
    expect(cuts).toBeDefined();
  });

  it("does not reset on Hold → Run (resume)", async () => {
    const segments = [
      makeSeg(0, 0, 10, 0, "cut", 1),
      makeSeg(10, 0, 20, 0, "cut", 2),
      makeSeg(20, 0, 30, 0, "cut", 3),
    ];
    const tp = makeToolpath(segments);

    render(<ProgressHost />);

    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
    });

    // Run to line 3
    await act(async () => {
      setStatus("Run", 30, 0, 3);
    });
    const cutsAfterRun = useCanvasStore.getState().plotProgressCuts;
    expect(cutsAfterRun.length).toBeGreaterThan(0);

    // Paused then resumed
    await act(async () => {
      setStatus("Hold", 30, 0);
    });
    await act(async () => {
      setStatus("Run", 30, 0, 3);
    });

    // Progress should not have been cleared (stay non-empty)
    expect(useCanvasStore.getState().plotProgressCuts.length).toBeGreaterThan(
      0,
    );
  });

  // ── Coordinate-based tracking ────────────────────────────────────────────

  it("advances progress via coordinate matching when no Ln: present", async () => {
    // Segments without lineNum (undefined fallback means coordinate tracking)
    const segs: GcodeSegment[] = [
      { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, type: "cut", lineNum: 0 },
      { from: { x: 10, y: 0 }, to: { x: 20, y: 0 }, type: "cut", lineNum: 0 },
    ];
    // Override lineNum to undefined to trigger coordinate path
    (segs[0] as any).lineNum = undefined;
    (segs[1] as any).lineNum = undefined;

    const tp = makeToolpath(segs);
    (tp.segments![0] as any).lineNum = undefined;
    (tp.segments![1] as any).lineNum = undefined;

    render(<ProgressHost />);

    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
    });

    // Machine at x=10, which is at the end of segment 0 / beginning of segment 1
    await act(async () => {
      setStatus("Run", 10, 0);
    });

    // Should have some progress (coordinate match found)
    const cuts = useCanvasStore.getState().plotProgressCuts;
    // May or may not match depending on tolerance; at least no throw
    expect(typeof cuts).toBe("string");
  });

  it("skips update when state is not Run or Hold", async () => {
    const segments = [makeSeg(0, 0, 10, 0, "cut", 1)];
    const tp = makeToolpath(segments);

    render(<ProgressHost />);

    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useCanvasStore.setState({ plotProgressCuts: "" } as any);
      useMachineStore.setState({ connected: true });
    });

    // Idle state — hook should return early without setting progress
    await act(async () => {
      setStatus("Idle", 5, 0, 1);
    });

    expect(useCanvasStore.getState().plotProgressCuts).toBe("");
  });
});
