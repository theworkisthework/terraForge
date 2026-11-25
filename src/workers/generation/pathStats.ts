/**
 * Diagnostics for the passes between collecting geometry and writing it —
 * sort, join, vinyl — so a job records what they did and how long they took.
 */
import type { Subpath } from "../gcodeEngine";

/** One pass's timing, plus whatever it changed. */
export interface PassStats {
  ms: number;
  /** Subpaths the sort drew end-to-start. */
  reversed?: number;
  /** Subpaths the join merged into their predecessor. */
  merged?: number;
}

export interface ProcessingStats {
  subpathsIn: number;
  subpathsOut: number;
  /** Pen-up travel between strokes, from the origin, before any pass ran. */
  travelBeforeMm: number;
  travelAfterMm: number;
  sort?: PassStats;
  join?: PassStats;
  weedBorder?: PassStats;
  vinyl?: PassStats;
}

/** Total pen-up distance to draw `subpaths` in order, starting at the origin
 * (where the nearest-neighbour sort assumes the pen starts). */
export function travelDistanceMm(subpaths: Subpath[]): number {
  let x = 0;
  let y = 0;
  let total = 0;
  for (const sp of subpaths) {
    if (sp.length === 0) continue;
    total += Math.hypot(sp[0].x - x, sp[0].y - y);
    const last = sp[sp.length - 1];
    x = last.x;
    y = last.y;
  }
  return total;
}

/** How many of `sorted` the sort reversed: it hands back the input arrays
 * it kept as they were, and a copy of each one it reversed. */
export function countReversed(input: Subpath[], sorted: Subpath[]): number {
  const kept = new Set(input);
  return sorted.reduce((n, sp) => (kept.has(sp) ? n : n + 1), 0);
}

const mm = (n: number) => `${n.toFixed(1)} mm`;
const ms = (n: number) => `${Math.round(n)} ms`;

/** The stats as G-code comment lines. Pass timings vary from run to run;
 * snapshot tests mask the "<n> ms" on the timed lines. */
export function formatStatsComments(stats: ProcessingStats): string[] {
  const lines = [`; Subpaths : ${stats.subpathsIn} in, ${stats.subpathsOut} out`];
  const saved = stats.travelBeforeMm - stats.travelAfterMm;
  const pct = stats.travelBeforeMm > 0 ? ` (${((saved / stats.travelBeforeMm) * 100).toFixed(1)}% less)` : "";
  lines.push(
    stats.sort || stats.join
      ? `; Travel   : ${mm(stats.travelBeforeMm)} -> ${mm(stats.travelAfterMm)}${pct}`
      : `; Travel   : ${mm(stats.travelAfterMm)}`,
  );
  if (stats.sort) lines.push(`; Sort     : ${ms(stats.sort.ms)}, ${stats.sort.reversed ?? 0} reversed`);
  if (stats.join) lines.push(`; Join     : ${ms(stats.join.ms)}, ${stats.join.merged ?? 0} merged`);
  if (stats.weedBorder) lines.push(`; Weed pass: ${ms(stats.weedBorder.ms)}`);
  if (stats.vinyl) lines.push(`; Blade cmp: ${ms(stats.vinyl.ms)}`);
  return lines;
}
