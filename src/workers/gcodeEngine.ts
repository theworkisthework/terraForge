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
import { flattenToSubpaths } from "./gcodeEngine/stages/flatteningFlow";

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
export { flattenToSubpaths };

// ── Bed clipping ─────────────────────────────────────────────────────────────

export { clipSubpathsToRect, clipSubpathsToBed };

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtCoord(n: number): string {
  return n.toFixed(3);
}
