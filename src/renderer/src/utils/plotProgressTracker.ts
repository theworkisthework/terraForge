/**
 * Live plot progress, tracked from machine status reports — the state
 * machine described at the top of usePlotProgress.ts, without React: the
 * hook feeds it status and publishes what it returns.
 */
import type { GcodeSegment } from "./gcodeParser";


// Segments to scan ahead per coordinate-matching update.
const LOOKAHEAD = 600;
// Only accept a coordinate match when perpendicular distance ≤ this (mm).
const MAX_DIST_MM = 2;
// Frontier advances within this many segments of the current position are
// treated as normal drawing progression and confirmed immediately.
// Larger jumps must be confirmed by MIN_CONSECUTIVE_HITS consecutive reports.
const NATURAL_ADVANCE = 5;
// Consecutive position reports required to confirm a frontier jump larger than
// NATURAL_ADVANCE before committing.
const MIN_CONSECUTIVE_HITS = 2;
// Maximum segment-index advance allowed *between two consecutive status ticks*
// for those ticks to count as the same pending / relocation candidate.
// Dense SVG-flattened curves at 3000 mm/min (5 Hz) advance ~20 segments per
// tick; 30 covers that while rejecting G0 rapids (60–100+ segments per tick).
const PENDING_MAX_JUMP = 30;
// Per-segment synthetic distance penalty added to candidates beyond
// NATURAL_ADVANCE ahead of the frontier.  This makes a marginally-closer wrong
// arc at index +60 lose to the geometrically-slightly-farther correct arc at
// index +2, preventing the tracker from latching onto overlapping wrong paths.
// 0.02 mm/seg: a wrong arc 50 segments ahead needs to be 0.9 mm closer to win.
const ADVANCE_PENALTY_PER_SEG = 0.02;
// Consecutive ticks with no match inside the bounded lookahead before the
// tracker attempts an unbounded global search to relocate the machine.
const STALE_RELOCATION_THRESHOLD = 6;

// ── Geometry helpers ──────────────────────────────────────────────────────────

function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { t: number; dist: number } {
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) return { t: 0, dist: Math.hypot(px - ax, py - ay) };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { t, dist: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
}

function findBestSegment(
  segments: GcodeSegment[],
  startIdx: number,
  px: number,
  py: number,
  lookahead: number,
  advancePenaltyPerSeg = 0,
): { idx: number; t: number; dist: number } {
  let bestIdx = startIdx,
    bestT = 0,
    bestDist = Infinity,
    bestScore = Infinity;
  const end = Math.min(segments.length, startIdx + lookahead);
  for (let i = startIdx; i < end; i++) {
    const { from, to } = segments[i];
    const { t, dist } = projectOnSegment(px, py, from.x, from.y, to.x, to.y);
    // Add a synthetic distance penalty for segments far ahead of the frontier.
    // This prevents a marginally-closer wrong arc from stealing the match.
    const ahead = i - startIdx;
    const score =
      dist +
      (ahead > NATURAL_ADVANCE
        ? (ahead - NATURAL_ADVANCE) * advancePenaltyPerSeg
        : 0);
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
      bestT = t;
      bestDist = dist; // return actual distance, not the penalised score
    }
  }
  return { idx: bestIdx, t: bestT, dist: bestDist };
}

/** Binary search: index of the last segment with lineNum ≤ targetLine, or -1. */
function findLastSegmentByLine(
  segments: GcodeSegment[],
  targetLine: number,
): number {
  let lo = 0,
    hi = segments.length - 1,
    result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ln = segments[mid].lineNum ?? 0;
    if (ln <= targetLine) {
      result = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return result;
}

function segToPath(seg: GcodeSegment, toX: number, toY: number): string {
  return `M ${seg.from.x.toFixed(3)} ${seg.from.y.toFixed(3)} L ${toX.toFixed(3)} ${toY.toFixed(3)}`;
}

// ── Accumulated path strings ──────────────────────────────────────────────────

interface Acc {
  cuts: string;
  rapids: string;
  /** Index of the last fully-appended segment (-1 = nothing yet). */
  completedUpTo: number;
}

/** Append segments[fromIdx..toIdxInclusive] to the accumulator.
 *  Uses bulk array-join for large cold-starts to avoid O(n²) concat. */
function appendSegmentsToAcc(
  acc: Acc,
  segments: GcodeSegment[],
  fromIdx: number,
  toIdxInclusive: number,
): void {
  if (fromIdx > toIdxInclusive) return;
  if (acc.completedUpTo === -1 && toIdxInclusive - fromIdx > 50) {
    // Bulk build to avoid repeated string concatenation
    const cutParts: string[] = acc.cuts ? [acc.cuts] : [];
    const rapParts: string[] = acc.rapids ? [acc.rapids] : [];
    for (let i = fromIdx; i <= toIdxInclusive; i++) {
      const seg = segments[i];
      const p = segToPath(seg, seg.to.x, seg.to.y);
      if (seg.type === "cut") cutParts.push(p);
      else rapParts.push(p);
    }
    acc.cuts = cutParts.join(" ");
    acc.rapids = rapParts.join(" ");
  } else {
    for (let i = fromIdx; i <= toIdxInclusive; i++) {
      const seg = segments[i];
      const p = " " + segToPath(seg, seg.to.x, seg.to.y);
      if (seg.type === "cut") acc.cuts += p;
      else acc.rapids += p;
    }
  }
  acc.completedUpTo = toIdxInclusive;
}

// ── Tracker ───────────────────────────────────────────────────────────────────

/** What to draw: completed cuts and rapids as path data, and the segment the
 * machine is on. */
export interface ProgressDisplay {
  cuts: string;
  rapids: string;
  frontierIdx: number;
}

export class PlotProgressTracker {
  private frontier = { idx: -1, t: 0 };
  private acc: Acc = { cuts: "", rapids: "", completedUpTo: -1 };
  /** Pending confirmation for a large frontier jump in the bounded search. */
  private pending = { idx: -1, hits: 0 };
  /** Consecutive reports with no match inside the bounded lookahead. */
  private staleTicks = 0;
  /** Pending confirmation for the unbounded relocation search. */
  private relocPending = { idx: -1, t: 0, hits: 0 };
  /**
   * Last known work-coordinate offset (WPos = MPos − WCO). FluidNC sends it
   * periodically, not in every report. (0,0,0) is right until an offset is
   * set: home is then the work origin.
   */
  private wco = { x: 0, y: 0, z: 0 };

  /** A new job or toolpath: forget progress, keeping the work offset. */
  resetJob(): void {
    this.frontier = { idx: -1, t: 0 };
    this.acc = { cuts: "", rapids: "", completedUpTo: -1 };
    this.pending = { idx: -1, hits: 0 };
    this.staleTicks = 0;
    this.relocPending = { idx: -1, t: 0, hits: 0 };
  }

  /** Disconnected: forget everything, the work offset too. */
  resetAll(): void {
    this.resetJob();
    this.wco = { x: 0, y: 0, z: 0 };
  }

  /** The machine's work position: WPos when reported (FluidNC's $10 bitmask),
   * else MPos − WCO, which stays right after "Set Zero". */
  workPosition(raw: string | undefined, mpos: { x: number; y: number }): { x: number; y: number } {
    const wcoMatch = raw?.match(/WCO:([-\d.]+),([-\d.]+),([-\d.]+)/);
    if (wcoMatch) this.wco = { x: +wcoMatch[1], y: +wcoMatch[2], z: +wcoMatch[3] };
    const wposRaw = raw?.match(/WPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
    return wposRaw ? { x: +wposRaw[1], y: +wposRaw[2] } : { x: mpos.x - this.wco.x, y: mpos.y - this.wco.y };
  }

  /**
   * Primary tracking, from the line FluidNC reports executing (`Ln:`, during
   * SD jobs): every segment from a line up to it is done. The reported line
   * may be mid-segment; counting it done errs by at most ~1 segment.
   */
  byLine(segments: GcodeSegment[], lineNum: number): ProgressDisplay {
    const acc = this.acc;
    const doneIdx = findLastSegmentByLine(segments, lineNum);
    if (doneIdx > acc.completedUpTo) {
      appendSegmentsToAcc(acc, segments, Math.max(0, acc.completedUpTo + 1), doneIdx);
    }
    this.frontier = { idx: doneIdx + 1, t: 0 };
    return { cuts: acc.cuts.trimStart(), rapids: acc.rapids.trimStart(), frontierIdx: doneIdx };
  }

  /**
   * Fallback tracking, from the work position: the nearest segment within a
   * bounded, penalised lookahead; large jumps confirmed over several reports;
   * and, after repeated misses, an unbounded search to relocate the machine.
   * Returns null when nothing should change, and says whether the frontier
   * advanced normally or was relocated.
   */
  byPosition(
    segments: GcodeSegment[],
    wpos: { x: number; y: number },
  ): (ProgressDisplay & { via: "advance" | "relocation" }) | null {
    const prevIdx = this.frontier.idx;
    const searchStart = Math.max(0, prevIdx);
    // Always bounded, even on the first update: a chance near-match far into
    // the path would otherwise jump the frontier by hundreds of segments.
    const { idx: newIdx, t: newT, dist } = findBestSegment(
      segments,
      searchStart,
      wpos.x,
      wpos.y,
      LOOKAHEAD,
      ADVANCE_PENALTY_PER_SEG,
    );

    if (dist > MAX_DIST_MM) {
      const relocated = this.relocate(segments, wpos, prevIdx);
      if (relocated) return { ...relocated, via: "relocation" };
      this.pending = { idx: -1, hits: 0 };
      return null;
    }
    // Good match — reset stale / relocation state.
    this.staleTicks = 0;
    this.relocPending = { idx: -1, t: 0, hits: 0 };
    // Never retreat the frontier.
    if (newIdx < prevIdx || (newIdx === prevIdx && newT < this.frontier.t && prevIdx >= 0)) return null;
    if (!this.confirmAdvance(newIdx, prevIdx)) return null;
    return { ...this.commit(segments, newIdx, newT), via: "advance" };
  }

  /**
   * Advances within NATURAL_ADVANCE segments are normal drawing progression:
   * confirmed at once. Larger jumps wait until MIN_CONSECUTIVE_HITS reports
   * each move at most PENDING_MAX_JUMP segments on from the last — steady
   * drawing, not a fast G0 rapid blowing through many segments per report.
   */
  private confirmAdvance(newIdx: number, prevIdx: number): boolean {
    if (newIdx - Math.max(0, prevIdx) <= NATURAL_ADVANCE) {
      this.pending = { idx: -1, hits: 0 };
      return true;
    }
    const pending = this.pending;
    const deltaFromLast = pending.idx >= 0 ? newIdx - pending.idx : 0;
    if (deltaFromLast < 0 || deltaFromLast > PENDING_MAX_JUMP) {
      this.pending = { idx: newIdx, hits: 1 };
      return false;
    }
    pending.hits++;
    pending.idx = newIdx;
    if (pending.hits < MIN_CONSECUTIVE_HITS) return false;
    this.pending = { idx: -1, hits: 0 };
    return true;
  }

  /**
   * After STALE_RELOCATION_THRESHOLD reports with no match in the bounded
   * window — the machine has left it — searches the rest of the file,
   * unpenalised, and commits once MIN_CONSECUTIVE_HITS reports agree.
   */
  private relocate(segments: GcodeSegment[], wpos: { x: number; y: number }, prevIdx: number): ProgressDisplay | null {
    this.staleTicks++;
    if (this.staleTicks < STALE_RELOCATION_THRESHOLD) return null;
    const searchStart = Math.max(0, prevIdx);
    const reloc = findBestSegment(segments, searchStart, wpos.x, wpos.y, segments.length - searchStart, 0);
    if (reloc.dist > MAX_DIST_MM || reloc.idx <= Math.max(0, prevIdx)) {
      this.relocPending = { idx: -1, t: 0, hits: 0 };
      return null;
    }
    const rp = this.relocPending;
    const delta = rp.idx >= 0 ? reloc.idx - rp.idx : 0;
    if (rp.idx < 0 || (delta >= 0 && delta <= PENDING_MAX_JUMP)) {
      rp.idx = reloc.idx;
      rp.t = reloc.t;
      rp.hits++;
    } else {
      this.relocPending = { idx: reloc.idx, t: reloc.t, hits: 1 };
    }
    if (this.relocPending.hits < MIN_CONSECUTIVE_HITS) return null;
    const { idx, t } = this.relocPending;
    this.pending = { idx: -1, hits: 0 };
    this.relocPending = { idx: -1, t: 0, hits: 0 };
    this.staleTicks = 0;
    return this.commit(segments, idx, t);
  }

  /** Marks everything before `idx` done and the frontier part-way along it. */
  private commit(segments: GcodeSegment[], idx: number, t: number): ProgressDisplay {
    const acc = this.acc;
    if (idx > acc.completedUpTo + 1) {
      appendSegmentsToAcc(acc, segments, Math.max(0, acc.completedUpTo + 1), idx - 1);
    }
    this.frontier = { idx, t };
    let cuts = acc.cuts;
    let rapids = acc.rapids;
    if (idx >= 0 && idx < segments.length && t > 0) {
      const seg = segments[idx];
      const endX = seg.from.x + (seg.to.x - seg.from.x) * t;
      const endY = seg.from.y + (seg.to.y - seg.from.y) * t;
      const part = (cuts || rapids ? " " : "") + segToPath(seg, endX, endY);
      if (seg.type === "cut") cuts += part;
      else rapids += part;
    }
    return { cuts: cuts.trimStart(), rapids: rapids.trimStart(), frontierIdx: idx };
  }
}
