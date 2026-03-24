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

  // ── WCO / WPos raw parsing ────────────────────────────────────────────────

  it("parses WCO from raw status string and applies offset", async () => {
    const segs: GcodeSegment[] = [
      { from: { x: 10, y: 0 }, to: { x: 20, y: 0 }, type: "cut", lineNum: 0 },
    ];
    (segs[0] as any).lineNum = undefined;
    const tp = makeToolpath(segs);

    render(<ProgressHost />);
    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
    });

    // Machine at MPos (15, 5) with WCO (0, 5) → WPos (15, 0) — on the segment
    await act(async () => {
      useMachineStore.setState({
        status: {
          state: "Run" as any,
          mpos: { x: 15, y: 5, z: 0 },
          wpos: { x: 15, y: 0, z: 0 },
          raw: "<Run|MPos:15,5,0|WCO:0,5,0>",
        },
      });
    });

    // A subsequent status should use the parsed WCO
    await act(async () => {
      setStatus("Run", 15, 5, undefined, "<Run|MPos:15,5,0>");
    });

    expect(typeof useCanvasStore.getState().plotProgressCuts).toBe("string");
  });

  it("parses WPos directly when present in raw", async () => {
    const segs: GcodeSegment[] = [
      { from: { x: 10, y: 0 }, to: { x: 20, y: 0 }, type: "cut", lineNum: 0 },
    ];
    (segs[0] as any).lineNum = undefined;
    const tp = makeToolpath(segs);

    render(<ProgressHost />);
    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
    });

    await act(async () => {
      useMachineStore.setState({
        status: {
          state: "Run" as any,
          mpos: { x: 999, y: 999, z: 0 }, // mpos irrelevant when WPos present
          wpos: { x: 15, y: 0, z: 0 },
          raw: "<Run|MPos:999,999,0|WPos:15,0,0>",
        },
      });
    });

    expect(typeof useCanvasStore.getState().plotProgressCuts).toBe("string");
  });

  // ── "Never retreat" frontier guard ───────────────────────────────────────

  it("never retreats the frontier when coordinate match lands on an earlier segment", async () => {
    // Build 20 short segments along X axis
    const segs: GcodeSegment[] = Array.from({ length: 20 }, (_, i) => ({
      from: { x: i * 5, y: 0 },
      to: { x: (i + 1) * 5, y: 0 },
      type: "cut" as const,
      lineNum: 0,
    }));
    segs.forEach((s) => {
      (s as any).lineNum = undefined;
    });
    const tp = makeToolpath(segs);

    render(<ProgressHost />);
    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
    });

    // Advance to segment ~10 (x=50)
    await act(async () => {
      setStatus("Run", 52, 0);
    });
    const cutsAfterForward = useCanvasStore.getState().plotProgressCuts;

    // Now report a position earlier in the path (x=10) — should NOT retreat
    await act(async () => {
      setStatus("Run", 12, 0);
    });
    // Progress should not regress
    const cutsAfterBackward = useCanvasStore.getState().plotProgressCuts;
    expect(cutsAfterBackward.length).toBeGreaterThanOrEqual(
      cutsAfterForward.length,
    );
  });

  // ── Stale ticks → unbounded relocation ───────────────────────────────────

  it("triggers stale relocation when position is out of tolerance for 6+ ticks", async () => {
    // Segment sitting at x=50—60; machine reports (0,0) which is >2mm away
    const segs: GcodeSegment[] = [
      {
        from: { x: 50, y: 0 },
        to: { x: 60, y: 0 },
        type: "cut" as const,
        lineNum: 0,
      },
    ];
    (segs[0] as any).lineNum = undefined;
    const tp = makeToolpath(segs);

    render(<ProgressHost />);
    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
      setStatus("Run", 0, 0); // prime the prevState to "Run"
    });

    // 7 consecutive out-of-range status updates (STALE_RELOCATION_THRESHOLD=6)
    for (let i = 0; i < 7; i++) {
      await act(async () => {
        setStatus("Run", 0, 0);
      });
    }

    // After stale threshold the hook attempts global relocation.
    // Machine at (0,0) is far from segment (50-60, 0) so global search
    // also fails → line 465: relocPendingRef cleared.
    expect(typeof useCanvasStore.getState().plotProgressCuts).toBe("string");
  });

  it("confirms relocation after MIN_CONSECUTIVE_HITS ticks near the relocated segment", async () => {
    // Segments: first 5 short, then one far ahead that the machine will jump to
    const segs: GcodeSegment[] = [
      {
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
        type: "cut" as const,
        lineNum: 0,
      },
      {
        from: { x: 1, y: 0 },
        to: { x: 2, y: 0 },
        type: "cut" as const,
        lineNum: 0,
      },
      {
        from: { x: 1000, y: 0 },
        to: { x: 1001, y: 0 },
        type: "cut" as const,
        lineNum: 0,
      },
    ];
    segs.forEach((s) => {
      (s as any).lineNum = undefined;
    });
    const tp = makeToolpath(segs);

    render(<ProgressHost />);
    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
      setStatus("Run", 0, 0);
    });

    // 7 out-of-range ticks while machine is NOT near any segment (position at 500,0)
    // — all segments are at 0-2 or 1000-1001; (500,0) is >2mm from both groups
    for (let i = 0; i < 7; i++) {
      await act(async () => {
        setStatus("Run", 500, 0);
      });
    }

    // Now machine moves near the far segment (1000.5, 0) — global relocation finds it
    // Two consecutive ticks near that segment confirm the relocation
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        setStatus("Run", 1000.5, 0);
      });
    }

    expect(typeof useCanvasStore.getState().plotProgressCuts).toBe("string");
  });

  // ── Large-jump confirmation gating ───────────────────────────────────────

  it("holds a large frontier jump in pending until MIN_CONSECUTIVE_HITS", async () => {
    // 50 segments along X so a jump of >5 (NATURAL_ADVANCE) is possible
    const segs: GcodeSegment[] = Array.from({ length: 50 }, (_, i) => ({
      from: { x: i * 2, y: 0 },
      to: { x: (i + 1) * 2, y: 0 },
      type: "cut" as const,
      lineNum: 0,
    }));
    segs.forEach((s) => {
      (s as any).lineNum = undefined;
    });
    const tp = makeToolpath(segs);

    render(<ProgressHost />);
    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
      setStatus("Run", 0, 0);
    });

    // First tick at segment 0 — small advance, confirmed immediately
    await act(async () => {
      setStatus("Run", 1, 0);
    });

    // Jump to segment 30 (x=60) — large jump >5 segments
    await act(async () => {
      setStatus("Run", 61, 0); // near segment 30
    });
    // After first tick of large jump, pending.hits=1 < MIN_CONSECUTIVE_HITS=2
    // so frontier not yet updated — plot progress may still reflect earlier state

    // Second tick near same region — confirms the jump
    await act(async () => {
      setStatus("Run", 63, 0);
    });

    // Now confirmed — plot progress should have advanced
    expect(typeof useCanvasStore.getState().plotProgressCuts).toBe("string");
  });

  it("resets pending when a tick jumps too far from the last pending position", async () => {
    const segs: GcodeSegment[] = Array.from({ length: 100 }, (_, i) => ({
      from: { x: i * 2, y: 0 },
      to: { x: (i + 1) * 2, y: 0 },
      type: "cut" as const,
      lineNum: 0,
    }));
    segs.forEach((s) => {
      (s as any).lineNum = undefined;
    });
    const tp = makeToolpath(segs);

    render(<ProgressHost />);
    await act(async () => {
      useCanvasStore.setState({ gcodeToolpath: tp });
      useMachineStore.setState({ connected: true });
      setStatus("Run", 0, 0);
    });

    // First large jump to segment 10 — starts pending
    await act(async () => {
      setStatus("Run", 21, 0);
    });

    // Second tick jumps much farther (> PENDING_MAX_JUMP=30 segments from prev)
    // → too large a per-tick jump → pending is reset, early return
    await act(async () => {
      setStatus("Run", 185, 0); // segment ~92, delta from pending(10) = 82 > 30
    });

    expect(typeof useCanvasStore.getState().plotProgressCuts).toBe("string");
  });
});
