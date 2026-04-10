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
import {
  nearestNeighbourSort,
  joinSubpaths,
} from "./gcodeEngine/stages/pathOptimization";
import {
  clipSubpathsToRect,
  clipSubpathsToBed,
} from "./gcodeEngine/stages/clipping";

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
export { nearestNeighbourSort };

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
export { joinSubpaths };

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

export { clipSubpathsToRect, clipSubpathsToBed };

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtCoord(n: number): string {
  return n.toFixed(3);
}
