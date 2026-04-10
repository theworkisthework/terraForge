/**
 * G-code engine — pure functions extracted from svgWorker.ts for testability.
 *
 * Contains: path tokenisation, absolute conversion, coordinate transform,
 * Bézier/arc flattening, nearest-neighbour optimiser, and G-code emission.
 */

import type { VectorObject, MachineConfig } from "../types";
import {
  tokenizePath,
  toAbsolute,
  type PathToken,
} from "./gcodeEngine/stages/pathParsing";
import {
  transformPt,
  cubicBezier,
  quadBezier,
  arcToBeziers,
  type Pt,
} from "./gcodeEngine/stages/geometryFlattening";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Subpath = Pt[];

export type { Pt };
export type { PathToken };

// ── Path tokenizer ────────────────────────────────────────────────────────────

export { tokenizePath };

// ── Absolute coordinate converter ─────────────────────────────────────────────

export { toAbsolute };

// ── Coordinate transform + flattening ───────────────────────────────────────

export { transformPt, cubicBezier, quadBezier, arcToBeziers };

// ── Nearest-neighbour path optimiser ──────────────────────────────────────────
//
// Uses a sqrt(n)×sqrt(n) spatial grid so that each lookup costs O(1) amortised
// rather than O(n), reducing total sort time from O(n²) to O(n√n).
// For 100 k subpaths this is roughly a 1000× speed improvement over the naive
// linear scan approach.

export function nearestNeighbourSort(subpaths: Subpath[]): Subpath[] {
  if (subpaths.length === 0) return [];
  const n = subpaths.length;
  if (n === 1) return [subpaths[0]];

  // ── Build bounding box of all start points ──────────────────────────────
  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity;
  for (const sp of subpaths) {
    const { x, y } = sp[0];
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  xMax += 1e-9;
  yMax += 1e-9; // guard band so max-coord points land inside a cell

  // ── Build spatial grid (~1 start point per cell on average) ────────────
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cw = (xMax - xMin) / cols;
  const ch = (yMax - yMin) / rows;
  const minCell = Math.min(cw, ch);

  // cells[r * cols + c] = list of subpath indices whose start falls in that cell
  const cells: number[][] = Array.from({ length: rows * cols }, () => []);
  for (let i = 0; i < n; i++) {
    const { x, y } = subpaths[i][0];
    const c = Math.min(cols - 1, Math.floor((x - xMin) / cw));
    const r = Math.min(rows - 1, Math.floor((y - yMin) / ch));
    cells[r * cols + c].push(i);
  }

  // ── Greedy nearest-neighbour traversal ──────────────────────────────────
  const visited = new Uint8Array(n);
  const sorted: Subpath[] = new Array(n);
  let curX = 0,
    curY = 0;

  for (let s = 0; s < n; s++) {
    let bestIdx = -1;
    let bestDist = Infinity;

    const cc = Math.min(cols - 1, Math.max(0, Math.floor((curX - xMin) / cw)));
    const cr = Math.min(rows - 1, Math.max(0, Math.floor((curY - yMin) / ch)));
    const maxRing = Math.max(cols, rows);

    for (let ring = 0; ring <= maxRing; ring++) {
      // Early-exit: the nearest any point in this ring can be is (ring-1)*minCell.
      // If the current best is already closer, no ring beyond this can improve it.
      if (bestIdx !== -1) {
        const minPossible = Math.max(0, ring - 1) * minCell;
        if (minPossible * minPossible > bestDist) break;
      }

      const rLo = Math.max(0, cr - ring),
        rHi = Math.min(rows - 1, cr + ring);
      const cLo = Math.max(0, cc - ring),
        cHi = Math.min(cols - 1, cc + ring);

      for (let gr = rLo; gr <= rHi; gr++) {
        for (let gc = cLo; gc <= cHi; gc++) {
          // Only examine perimeter cells of the ring, not the interior
          if (ring > 0 && gr > rLo && gr < rHi && gc > cLo && gc < cHi)
            continue;
          for (const idx of cells[gr * cols + gc]) {
            if (visited[idx]) continue;
            const { x, y } = subpaths[idx][0];
            const d = (x - curX) ** 2 + (y - curY) ** 2;
            if (d < bestDist) {
              bestDist = d;
              bestIdx = idx;
            }
          }
        }
      }
    }

    if (bestIdx === -1) {
      // Fallback: linear scan for any unvisited entry (should never be reached)
      for (let i = 0; i < n; i++)
        if (!visited[i]) {
          bestIdx = i;
          break;
        }
    }

    visited[bestIdx] = 1;
    sorted[s] = subpaths[bestIdx];
    const last = subpaths[bestIdx][subpaths[bestIdx].length - 1];
    curX = last.x;
    curY = last.y;
  }

  return sorted;
}

// ── Path joiner ───────────────────────────────────────────────────────────────

/**
 * Merges consecutive subpaths whose endpoint→startpoint distance is within
 * `toleranceMm`.  When two subpaths are joined the pen is never lifted —
 * the start point of the second subpath is included as a G1 continuation of
 * the first, avoiding a pen-up / rapid-travel / pen-down cycle.
 *
 * Should be called AFTER nearestNeighbourSort so that the NN ordering has
 * already placed nearby subpaths adjacently, maximising merge opportunities.
 */
export function joinSubpaths(
  subpaths: Subpath[],
  toleranceMm: number,
): Subpath[] {
  if (subpaths.length === 0) return [];
  const tolSq = toleranceMm * toleranceMm;
  const result: Subpath[] = [];
  let current = subpaths[0].slice();

  for (let i = 1; i < subpaths.length; i++) {
    const next = subpaths[i];
    const tail = current[current.length - 1];
    const head = next[0];
    const distSq = (tail.x - head.x) ** 2 + (tail.y - head.y) ** 2;
    if (distSq <= tolSq) {
      // Within tolerance — continue drawing; include next's points (head first,
      // as a tiny G1 to its exact position, then the rest of the subpath).
      current.push(...next);
    } else {
      result.push(current);
      current = next.slice();
    }
  }
  result.push(current);
  return result;
}

// ── Main flattener ────────────────────────────────────────────────────────────

export function flattenToSubpaths(
  obj: VectorObject,
  config: MachineConfig,
): Subpath[] {
  const subpaths: Subpath[] = [];
  const abs = toAbsolute(tokenizePath(obj.path));
  let cur: Subpath = [];
  let cx = 0,
    cy = 0,
    startX = 0,
    startY = 0;
  let lastCpX = 0,
    lastCpY = 0;

  const push = (x: number, y: number) => {
    cur.push(transformPt(obj, config, x, y));
    cx = x;
    cy = y;
  };

  for (const cmd of abs) {
    const t = cmd.type;
    const a = cmd.args;
    switch (t) {
      case "M": {
        if (cur.length > 1) subpaths.push(cur);
        cur = [];
        cx = a[0];
        cy = a[1];
        startX = cx;
        startY = cy;
        cur.push(transformPt(obj, config, cx, cy));
        lastCpX = cx;
        lastCpY = cy;
        for (let i = 2; i < a.length; i += 2) push(a[i], a[i + 1]);
        break;
      }
      case "L":
        for (let i = 0; i < a.length; i += 2) push(a[i], a[i + 1]);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "H":
        for (let i = 0; i < a.length; i++) push(a[i], cy);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "V":
        for (let i = 0; i < a.length; i++) push(cx, a[i]);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "Z":
        push(startX, startY);
        subpaths.push(cur);
        cur = [];
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "C":
        for (let i = 0; i < a.length; i += 6) {
          for (const p of cubicBezier(
            cx,
            cy,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
            a[i + 4],
            a[i + 5],
          ))
            push(p.x, p.y);
          lastCpX = a[i + 2];
          lastCpY = a[i + 3];
        }
        break;
      case "S":
        for (let i = 0; i < a.length; i += 4) {
          const c1x = 2 * cx - lastCpX,
            c1y = 2 * cy - lastCpY;
          for (const p of cubicBezier(
            cx,
            cy,
            c1x,
            c1y,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
          ))
            push(p.x, p.y);
          lastCpX = a[i];
          lastCpY = a[i + 1];
        }
        break;
      case "Q":
        for (let i = 0; i < a.length; i += 4) {
          for (const p of quadBezier(
            cx,
            cy,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
          ))
            push(p.x, p.y);
          lastCpX = a[i];
          lastCpY = a[i + 1];
        }
        break;
      case "T":
        for (let i = 0; i < a.length; i += 2) {
          const cpx = 2 * cx - lastCpX,
            cpy = 2 * cy - lastCpY;
          for (const p of quadBezier(cx, cy, cpx, cpy, a[i], a[i + 1]))
            push(p.x, p.y);
          lastCpX = cpx;
          lastCpY = cpy;
        }
        break;
      case "A":
        for (let i = 0; i < a.length; i += 7) {
          for (const p of arcToBeziers(
            cx,
            cy,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
            a[i + 4],
            a[i + 5],
            a[i + 6],
          ))
            push(p.x, p.y);
          lastCpX = cx;
          lastCpY = cy;
        }
        break;
    }
  }
  if (cur.length > 1) subpaths.push(cur);
  return subpaths;
}

// ── Bed clipping ─────────────────────────────────────────────────────────────

/**
 * Liang-Barsky line-segment clipper.
 * Clips segment (x0,y0)→(x1,y1) against axis-aligned rectangle.
 * Returns [t0, t1] parametric range of the visible portion, or null if
 * the segment lies entirely outside the rectangle.
 */
function liangBarsky(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): [number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0,
    t1 = 1;
  const tests: [number, number][] = [
    [-dx, x0 - xMin],
    [dx, xMax - x0],
    [-dy, y0 - yMin],
    [dy, yMax - y0],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null; // parallel and outside
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return [t0, t1];
}

/**
 * Clips an array of polyline subpaths against an explicit axis-aligned
 * rectangle [xMin, xMax] × [yMin, yMax] (all in machine mm).
 * A single input subpath may split into several output subpaths when its
 * segments exit and re-enter the rectangle.  Segments entirely outside are
 * silently dropped.
 */
export function clipSubpathsToRect(
  subpaths: Subpath[],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): Subpath[] {
  const result: Subpath[] = [];

  for (const subpath of subpaths) {
    let current: Subpath = [];

    const interp = (p0: Pt, p1: Pt, t: number): Pt => ({
      x: p0.x + t * (p1.x - p0.x),
      y: p0.y + t * (p1.y - p0.y),
    });

    for (let i = 0; i + 1 < subpath.length; i++) {
      const p0 = subpath[i];
      const p1 = subpath[i + 1];
      const clip = liangBarsky(p0.x, p0.y, p1.x, p1.y, xMin, xMax, yMin, yMax);

      if (clip === null) {
        // Segment fully outside — flush any open run.
        if (current.length >= 2) result.push(current);
        current = [];
        continue;
      }

      const [t0, t1] = clip;

      if (t0 > 1e-9) {
        // Segment enters the rect mid-way — flush previous run and start fresh.
        if (current.length >= 2) result.push(current);
        current = [interp(p0, p1, t0)];
      } else if (current.length === 0) {
        // Starting a new run from inside (or right on) the rect boundary.
        current.push(p0);
      }
      // Append the exit point.
      current.push(interp(p0, p1, t1));

      if (t1 < 1 - 1e-9) {
        // Segment exits the rect before reaching p1 — flush this run.
        if (current.length >= 2) result.push(current);
        current = [];
      }
    }

    if (current.length >= 2) result.push(current);
  }

  return result;
}

/**
 * Clips an array of polyline subpaths (already in machine mm coordinates)
 * against the bed rectangle implied by config.  A single input subpath may
 * split into several output subpaths when its segments exit and re-enter the
 * bed area.  Segments entirely outside the bed are silently dropped.
 */
export function clipSubpathsToBed(
  subpaths: Subpath[],
  config: MachineConfig,
): Subpath[] {
  const isCenter = config.origin === "center";
  const xMin = isCenter ? -config.bedWidth / 2 : 0;
  const xMax = isCenter ? config.bedWidth / 2 : config.bedWidth;
  const yMin = isCenter ? -config.bedHeight / 2 : 0;
  const yMax = isCenter ? config.bedHeight / 2 : config.bedHeight;
  return clipSubpathsToRect(subpaths, xMin, xMax, yMin, yMax);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtCoord(n: number): string {
  return n.toFixed(3);
}
