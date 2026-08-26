// ── G-code duration estimator ─────────────────────────────────────────────────
//
// Produces a naive per-line time budget from segment geometry + configured
// speeds. This is intentionally approximate: it ignores firmware acceleration
// limits, junction deviation cornering, and dwell (G4) commands. It exists to
// seed a live ETA that gets corrected against actual observed pace once a job
// is running — see useJobEta.ts.

import type { GcodeSegment } from "./gcodeParser";

export interface GcodeDurationEstimate {
  /** Source line number for each segment, parallel to cumulativeMs. */
  lineNums: Int32Array;
  /** Cumulative estimated ms elapsed through completion of each segment's line. */
  cumulativeMs: Float64Array;
  /** Total estimated duration in ms. */
  totalMs: number;
}

export interface GcodeDurationParams {
  /** Assumed rapid (G0) travel speed in mm/min — machine firmware rapid rate isn't known to the app,
   *  so this is approximated using the configured jog speed. */
  travelSpeedMmMin: number;
  /** Fallback drawing feedrate (mm/min) for cut segments with no F-word recorded. */
  drawSpeedMmMin: number;
  /** Fixed delay applied whenever a rapid is followed by a cut (pen touching down). */
  penDownDelayMs: number;
  /** Fixed delay applied whenever a cut is followed by a rapid (pen lifting). */
  penUpDelayMs: number;
}

export function estimateGcodeDuration(
  segments: GcodeSegment[],
  params: GcodeDurationParams,
): GcodeDurationEstimate {
  const n = segments.length;
  const lineNums = new Int32Array(n);
  const cumulativeMs = new Float64Array(n);
  let cum = 0;
  let prevType: GcodeSegment["type"] | null = null;

  for (let i = 0; i < n; i++) {
    const seg = segments[i];
    const dist = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y);
    const feedMmMin =
      seg.type === "cut"
        ? (seg.feed ?? params.drawSpeedMmMin) || params.drawSpeedMmMin
        : params.travelSpeedMmMin;
    const moveMs = feedMmMin > 0 ? (dist / feedMmMin) * 60_000 : 0;

    let overheadMs = 0;
    if (prevType === "rapid" && seg.type === "cut")
      overheadMs = params.penDownDelayMs;
    else if (prevType === "cut" && seg.type === "rapid")
      overheadMs = params.penUpDelayMs;

    cum += moveMs + overheadMs;
    lineNums[i] = seg.lineNum;
    cumulativeMs[i] = cum;
    prevType = seg.type;
  }

  return { lineNums, cumulativeMs, totalMs: cum };
}

/** Binary search: index of the last entry with lineNum ≤ targetLine, or -1. */
export function findLastEstimateIndexForLine(
  estimate: GcodeDurationEstimate,
  targetLine: number,
): number {
  let lo = 0,
    hi = estimate.lineNums.length - 1,
    result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (estimate.lineNums[mid] <= targetLine) {
      result = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return result;
}

/** Formats a millisecond duration to the nearest minute as "1d 02h 22m",
 *  "23h 15m", "12m", or "<1m". */
export function formatEtaDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 1000 / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0)
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}
