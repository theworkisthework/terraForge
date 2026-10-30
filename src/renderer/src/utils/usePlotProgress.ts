// ── usePlotProgress ───────────────────────────────────────────────────────────
//
// Tracks live plot progress by comparing the machine's reported position to
// the parsed G-code segment list, then adds a halo behind completed segments
// without replacing the existing toolpath colours.
//
// Two tracking strategies (tried in order):
//
// 1. LINE-NUMBER (primary) — FluidNC reports `Ln:N` or `Ln:N,Total` in status
//    during SD card jobs.  We store the source line number in each GcodeSegment
//    at parse time, so we can binary-search to find the current segment exactly.
//    No coordinate matching needed — WCS offsets / MPos vs WPos ambiguities are
//    irrelevant.
//
// 2. COORDINATE MATCHING (fallback) — Used when Ln: is absent (streaming or
//    older firmware).  Projects the machine work position onto the nearest
//    segment.  We parse WCO: from the raw status string to compute the correct
//    WPos = MPos − WCO, so "Set Zero" use-cases work correctly even when
//    FluidNC only sends MPos in status.
//
//    Three layers guard against false advances in dense / overlapping plots:
//
//      a) Advance penalty   — segments far ahead of the frontier receive a
//         synthetic distance penalty so a marginally-closer wrong arc does not
//         beat the correct nearby arc and jump the frontier forward.
//
//      b) Confirmation gate — jumps larger than NATURAL_ADVANCE are only
//         committed after MIN_CONSECUTIVE_HITS consecutive status reports agree
//         the machine is advancing steadily through that region.
//
//      c) Stale relocation  — after STALE_RELOCATION_THRESHOLD consecutive
//         ticks with no match inside the bounded lookahead window (the machine
//         has moved outside it), an unbounded unpenalised global search locates
//         the machine, confirmed over MIN_CONSECUTIVE_HITS ticks before commit.

import { useShallow } from "zustand/react/shallow";
import { useEffect, useRef } from "react";
import { useMachineStore } from "../store/machineStore";
import { useCanvasStore } from "../store/canvasStore";
import { selectPlotProgressCanvasState } from "../store/canvasSelectors";
import { PlotProgressTracker } from "./plotProgressTracker";

export function usePlotProgress(): void {
  const status = useMachineStore((s) => s.status);
  const connected = useMachineStore((s) => s.connected);
  const { gcodeToolpath, setPlotProgress, clearPlotProgress } = useCanvasStore(
    useShallow(selectPlotProgressCanvasState),
  );

  const trackerRef = useRef(new PlotProgressTracker());
  const prevStateRef = useRef<string | null>(null);
  // Debounce timeout for clearing progress glow to avoid flickering on brief
  // state oscillations (e.g., Run → Idle → Run bouncing at the end of a job).
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reset when the toolpath changes (new file previewed / toolpath cleared) ─
  useEffect(() => {
    trackerRef.current.resetJob();
    prevStateRef.current = null;
    clearPlotProgress();
  }, [gcodeToolpath, clearPlotProgress]);

  // ── Reset on disconnect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      trackerRef.current.resetAll();
      prevStateRef.current = null;
      clearPlotProgress();
    }
  }, [connected, clearPlotProgress]);

  // ── Main tracking effect — fires on every status push ─────────────────────
  useEffect(() => {
    const segments = gcodeToolpath?.segments;
    if (!segments?.length || !status) {
      prevStateRef.current = status?.state ?? null;
      return;
    }

    const tracker = trackerRef.current;
    const { state, mpos, raw } = status;
    const prevState = prevStateRef.current;
    prevStateRef.current = state;
    const wpos = tracker.workPosition(raw, mpos);

    // Only a genuine new start resets progress, not Hold → Run (a resume),
    // which would wipe the accumulated progress and force a slow rebuild.
    if (prevState !== "Run" && prevState !== "Hold" && state === "Run") tracker.resetJob();

    const running = state === "Run" || state === "Hold";
    if (running && clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
    if (!running) {
      // Only clear after 800 ms out of a running state, so brief state
      // oscillations do not flicker the progress away.
      if (!clearTimeoutRef.current) {
        clearTimeoutRef.current = setTimeout(() => {
          clearPlotProgress();
          clearTimeoutRef.current = null;
        }, 800);
      }
      return;
    }

    // Line numbers need Ln: in the status (SD jobs) and in the parsed segments.
    if (status.lineNum !== undefined && segments[0]?.lineNum !== undefined) {
      const shown = tracker.byLine(segments, status.lineNum);
      setPlotProgress(shown.cuts, shown.rapids, shown.frontierIdx);
      return;
    }

    const shown = tracker.byPosition(segments, wpos);
    if (!shown) return;
    setPlotProgress(shown.cuts, shown.rapids, shown.frontierIdx);
    if (shown.via === "relocation") return;

    // Cleanup: cancel any pending clear timeout on unmount
    return () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, [status, gcodeToolpath, setPlotProgress]);
}
