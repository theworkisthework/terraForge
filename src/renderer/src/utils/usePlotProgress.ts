// ── usePlotProgress ───────────────────────────────────────────────────────────
//
// Tracks live plot progress by comparing the machine's reported position to
// the parsed G-code segment list, then paints completed segments red/orange
// over the existing toolpath overlay.
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
import { selectPlotProgressCanvasState } from "../store/canvasStoreSelectors";
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePlotProgress(): void {
  const status = useMachineStore((s) => s.status);
  const connected = useMachineStore((s) => s.connected);
  const { gcodeToolpath, setPlotProgress, clearPlotProgress } = useCanvasStore(
    useShallow(selectPlotProgressCanvasState),
  );

  const frontierRef = useRef<{ idx: number; t: number }>({ idx: -1, t: 0 });
  const accRef = useRef<Acc>({ cuts: "", rapids: "", completedUpTo: -1 });
  const prevStateRef = useRef<string | null>(null);
  // Last known WCO (work-coordinate offset) parsed from FluidNC status.
  // WPos = MPos − WCO.  Initialised to (0,0,0) — correct when no offset
  // has been set (home position = work origin).
  const wcoRef = useRef({ x: 0, y: 0, z: 0 });
  // Pending confirmation for large frontier jumps in the normal bounded search.
  const pendingRef = useRef<{ idx: number; hits: number }>({
    idx: -1,
    hits: 0,
  });
  // Consecutive ticks with no match inside the bounded lookahead window.
  const staleTicksRef = useRef(0);
  // Pending confirmation for the unbounded relocation search.
  // Includes `t` so we can render the partial frontier segment on commit.
  const relocPendingRef = useRef<{ idx: number; t: number; hits: number }>({
    idx: -1,
    t: 0,
    hits: 0,
  });

  // ── Reset when the toolpath changes (new file previewed / toolpath cleared) ─
  useEffect(() => {
    frontierRef.current = { idx: -1, t: 0 };
    accRef.current = { cuts: "", rapids: "", completedUpTo: -1 };
    pendingRef.current = { idx: -1, hits: 0 };
    staleTicksRef.current = 0;
    relocPendingRef.current = { idx: -1, t: 0, hits: 0 };
    prevStateRef.current = null;
    clearPlotProgress();
  }, [gcodeToolpath, clearPlotProgress]);

  // ── Reset on disconnect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) {
      frontierRef.current = { idx: -1, t: 0 };
      accRef.current = { cuts: "", rapids: "", completedUpTo: -1 };
      pendingRef.current = { idx: -1, hits: 0 };
      staleTicksRef.current = 0;
      relocPendingRef.current = { idx: -1, t: 0, hits: 0 };
      prevStateRef.current = null;
      wcoRef.current = { x: 0, y: 0, z: 0 };
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

    const { state, mpos, raw } = status;
    const prevState = prevStateRef.current;

    // ── Keep WCO up to date (sent periodically by FluidNC, not every packet) ─
    const wcoMatch = raw?.match(/WCO:([-\d.]+),([-\d.]+),([-\d.]+)/);
    if (wcoMatch) {
      wcoRef.current = { x: +wcoMatch[1], y: +wcoMatch[2], z: +wcoMatch[3] };
    }

    // ── Compute true work position ─────────────────────────────────────────
    // Prefer WPos: if FluidNC sends it (controlled by $10 bitmask).
    // Otherwise derive from MPos − WCO (correct after "Set Zero").
    const wposRaw = raw?.match(/WPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
    const wpos = wposRaw
      ? { x: +wposRaw[1], y: +wposRaw[2] }
      : { x: mpos.x - wcoRef.current.x, y: mpos.y - wcoRef.current.y };

    // ── Detect new job start ───────────────────────────────────────────────
    // Only reset progress on a genuine new start, NOT on Hold → Run (resume).
    // A Hold → Run transition is a pause/resume cycle on the same job; resetting
    // here would wipe all accumulated red progress and force a slow rebuild.
    if (prevState !== "Run" && prevState !== "Hold" && state === "Run") {
      frontierRef.current = { idx: -1, t: 0 };
      accRef.current = { cuts: "", rapids: "", completedUpTo: -1 };
      pendingRef.current = { idx: -1, hits: 0 };
      staleTicksRef.current = 0;
      relocPendingRef.current = { idx: -1, t: 0, hits: 0 };
    }

    if (state !== "Run" && state !== "Hold") {
      prevStateRef.current = state;
      return;
    }

    const acc = accRef.current;

    // ════════════════════════════════════════════════════════════════════════
    // PRIMARY: line-number tracking
    // Requires Ln: in FluidNC status (reported during SD card jobs) and
    // lineNum stored in each GcodeSegment (added at parse time).
    // ════════════════════════════════════════════════════════════════════════
    if (status.lineNum !== undefined && segments[0]?.lineNum !== undefined) {
      // All segments whose source line ≤ current reported line are done.
      // (The reported line is currently being executed, so it may be mid-segment;
      // we mark it as complete — error is at most ~1 segment / <1 mm of travel.)
      const doneIdx = findLastSegmentByLine(segments, status.lineNum);

      if (doneIdx > acc.completedUpTo) {
        appendSegmentsToAcc(
          acc,
          segments,
          Math.max(0, acc.completedUpTo + 1),
          doneIdx,
        );
      }
      frontierRef.current = { idx: doneIdx + 1, t: 0 };
      setPlotProgress(acc.cuts.trimStart(), acc.rapids.trimStart());
      prevStateRef.current = state;
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // FALLBACK: coordinate-based tracking with WCO-corrected work position
    // ════════════════════════════════════════════════════════════════════════
    const { idx: prevIdx } = frontierRef.current;
    const searchStart = Math.max(0, prevIdx);
    // Always use a bounded lookahead, even on the first update.
    // Streaming jobs always start from the beginning of the file, so there is
    // never a need to scan the entire segment list on the first tick.  Scanning
    // all segments was the primary cause of "lots of lines suddenly turn red":
    // a chance near-match far into the path would jump the frontier by hundreds
    // of segments in one update, coloring them all red at once.
    const lookahead = LOOKAHEAD;

    // Penalised search within the bounded lookahead window.  The penalty
    // makes segments far ahead of the frontier less attractive than nearby ones
    // with a slightly worse geometric fit, preventing wrong-arc latching in
    // dense / overlapping plots.
    const {
      idx: newIdx,
      t: newT,
      dist,
    } = findBestSegment(
      segments,
      searchStart,
      wpos.x,
      wpos.y,
      lookahead,
      ADVANCE_PENALTY_PER_SEG,
    );

    if (dist > MAX_DIST_MM) {
      // No match within tolerance in the bounded window.  The machine has
      // likely moved past the lookahead horizon (tracker was misaligned or
      // the job made a long rapid that left the search window behind).
      staleTicksRef.current++;

      if (staleTicksRef.current >= STALE_RELOCATION_THRESHOLD) {
        // ── Unbounded unpenalised relocation ─────────────────────────────
        // Search the entire remaining file without a distance penalty so we can
        // find the machine wherever it actually is, then confirm over
        // MIN_CONSECUTIVE_HITS ticks before committing the frontier jump.
        const reloc = findBestSegment(
          segments,
          searchStart,
          wpos.x,
          wpos.y,
          segments.length - searchStart,
          0,
        );
        if (reloc.dist <= MAX_DIST_MM && reloc.idx > Math.max(0, prevIdx)) {
          const rp = relocPendingRef.current;
          const delta = rp.idx >= 0 ? reloc.idx - rp.idx : 0;
          if (rp.idx < 0 || (delta >= 0 && delta <= PENDING_MAX_JUMP)) {
            rp.idx = reloc.idx;
            rp.t = reloc.t;
            rp.hits++;
          } else {
            // Relocation candidate jumped too far — restart the count.
            relocPendingRef.current = { idx: reloc.idx, t: reloc.t, hits: 1 };
          }
          if (relocPendingRef.current.hits >= MIN_CONSECUTIVE_HITS) {
            // Confirmed relocation — commit the frontier jump.
            const rIdx = relocPendingRef.current.idx;
            const rT = relocPendingRef.current.t;
            pendingRef.current = { idx: -1, hits: 0 };
            relocPendingRef.current = { idx: -1, t: 0, hits: 0 };
            staleTicksRef.current = 0;
            if (rIdx > acc.completedUpTo + 1) {
              appendSegmentsToAcc(
                acc,
                segments,
                Math.max(0, acc.completedUpTo + 1),
                rIdx - 1,
              );
            }
            frontierRef.current = { idx: rIdx, t: rT };
            let displayCutsR = acc.cuts;
            let displayRapidsR = acc.rapids;
            if (rIdx >= 0 && rIdx < segments.length && rT > 0) {
              const seg = segments[rIdx];
              const endX = seg.from.x + (seg.to.x - seg.from.x) * rT;
              const endY = seg.from.y + (seg.to.y - seg.from.y) * rT;
              const part =
                (displayCutsR || displayRapidsR ? " " : "") +
                segToPath(seg, endX, endY);
              if (seg.type === "cut") displayCutsR += part;
              else displayRapidsR += part;
            }
            setPlotProgress(
              displayCutsR.trimStart(),
              displayRapidsR.trimStart(),
            );
            prevStateRef.current = state;
            return;
          }
        } else {
          // Global search also found nothing — clear relocation candidate.
          relocPendingRef.current = { idx: -1, t: 0, hits: 0 };
        }
      }

      pendingRef.current = { idx: -1, hits: 0 };
      prevStateRef.current = state;
      return;
    }
    // Good match — reset stale / relocation state.
    staleTicksRef.current = 0;
    relocPendingRef.current = { idx: -1, t: 0, hits: 0 };
    // Never retreat the frontier.
    if (
      newIdx < prevIdx ||
      (newIdx === prevIdx && newT < frontierRef.current.t && prevIdx >= 0)
    ) {
      prevStateRef.current = state;
      return;
    }

    // ── Confirmation gating for large frontier jumps ──────────────────────
    // Advances within NATURAL_ADVANCE segments of the current frontier are
    // normal drawing progression — confirm immediately.
    // Larger jumps are held in a pending state until MIN_CONSECUTIVE_HITS
    // consecutive status reports all move the candidate forward by at most
    // PENDING_MAX_JUMP segments per tick, which confirms "the machine is
    // steadily drawing through this region" vs. a fast G0 rapid that blows
    // through many more segments per tick and keeps resetting the window.
    const jump = newIdx - Math.max(0, prevIdx);
    if (jump > NATURAL_ADVANCE) {
      const pending = pendingRef.current;
      // Accept this tick if the machine advanced at most PENDING_MAX_JUMP
      // segments from wherever the *previous* pending hit landed.  This
      // lets dense cut sequences accumulate hits even when the absolute
      // jump from the committed frontier is large, while fast G0 rapids
      // (which zoom past PENDING_MAX_JUMP segments per tick) keep resetting.
      const deltaFromLast = pending.idx >= 0 ? newIdx - pending.idx : 0;
      if (deltaFromLast >= 0 && deltaFromLast <= PENDING_MAX_JUMP) {
        // Progressive forward advance — accumulate.
        pending.hits++;
        pending.idx = newIdx; // slide window to the latest position
      } else {
        // Too large a per-tick jump (or new direction) — start a fresh count.
        pendingRef.current = { idx: newIdx, hits: 1 };
        prevStateRef.current = state;
        return;
      }
      if (pending.hits < MIN_CONSECUTIVE_HITS) {
        // Not yet confirmed — wait for more consecutive reports.
        prevStateRef.current = state;
        return;
      }
      // Enough consecutive reports — confirmed.  Clear pending and advance.
      pendingRef.current = { idx: -1, hits: 0 };
    } else {
      // Small natural advance — clear any stale pending candidate.
      pendingRef.current = { idx: -1, hits: 0 };
    }

    if (newIdx > acc.completedUpTo + 1) {
      appendSegmentsToAcc(
        acc,
        segments,
        Math.max(0, acc.completedUpTo + 1),
        newIdx - 1,
      );
    }
    frontierRef.current = { idx: newIdx, t: newT };

    // Append partial frontier segment
    let displayCuts = acc.cuts;
    let displayRapids = acc.rapids;
    if (newIdx >= 0 && newIdx < segments.length && newT > 0) {
      const seg = segments[newIdx];
      const endX = seg.from.x + (seg.to.x - seg.from.x) * newT;
      const endY = seg.from.y + (seg.to.y - seg.from.y) * newT;
      const part =
        (displayCuts || displayRapids ? " " : "") + segToPath(seg, endX, endY);
      if (seg.type === "cut") displayCuts += part;
      else displayRapids += part;
    }

    setPlotProgress(displayCuts.trimStart(), displayRapids.trimStart());
    prevStateRef.current = state;
  }, [status, gcodeToolpath, setPlotProgress]);
}
