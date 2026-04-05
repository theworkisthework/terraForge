/**
 * G-code engine — pure functions extracted from svgWorker.ts for testability.
 *
 * Contains: path tokenisation, absolute conversion, coordinate transform,
 * Bézier/arc flattening, nearest-neighbour optimiser, and G-code emission.
 */

import type { VectorObject, MachineConfig } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}
export type Subpath = Pt[];

export interface PathToken {
  type: string;
  args: number[];
}

// ── Path tokenizer ────────────────────────────────────────────────────────────

export function tokenizePath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([\s\S]*?)(?=[MmLlHhVvCcSsQqTtAaZz]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const args = m[2].trim()
      ? m[2]
          .trim()
          .split(/[\s,]+|(?=-)/)
          .filter(Boolean)
          .map(Number)
          .filter(isFinite)
      : [];
    tokens.push({ type: m[1], args });
  }
  return tokens;
}

// ── Absolute coordinate converter ─────────────────────────────────────────────

export function toAbsolute(tokens: PathToken[]): PathToken[] {
  const abs: PathToken[] = [];
  let cx = 0,
    cy = 0,
    startX = 0,
    startY = 0;

  for (const tok of tokens) {
    const t = tok.type;
    const T = t.toUpperCase();
    const rel = t !== T && T !== "Z";
    const a = tok.args.slice();

    if (T === "Z") {
      abs.push({ type: "Z", args: [] });
      cx = startX;
      cy = startY;
      continue;
    }

    switch (T) {
      case "M": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 2) {
          const ax = rel ? cx + a[i] : a[i];
          const ay = rel ? cy + a[i + 1] : a[i + 1];
          out.push(ax, ay);
          cx = ax;
          cy = ay;
          if (i === 0) {
            startX = cx;
            startY = cy;
          }
        }
        abs.push({ type: "M", args: out });
        break;
      }
      case "L": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 2) {
          cx = rel ? cx + a[i] : a[i];
          cy = rel ? cy + a[i + 1] : a[i + 1];
          out.push(cx, cy);
        }
        abs.push({ type: "L", args: out });
        break;
      }
      case "H": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i++) {
          cx = rel ? cx + a[i] : a[i];
          out.push(cx);
        }
        abs.push({ type: "H", args: out });
        break;
      }
      case "V": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i++) {
          cy = rel ? cy + a[i] : a[i];
          out.push(cy);
        }
        abs.push({ type: "V", args: out });
        break;
      }
      case "C": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 6) {
          out.push(
            rel ? cx + a[i] : a[i],
            rel ? cy + a[i + 1] : a[i + 1],
            rel ? cx + a[i + 2] : a[i + 2],
            rel ? cy + a[i + 3] : a[i + 3],
            rel ? cx + a[i + 4] : a[i + 4],
            rel ? cy + a[i + 5] : a[i + 5],
          );
          cx = out[out.length - 2];
          cy = out[out.length - 1];
        }
        abs.push({ type: "C", args: out });
        break;
      }
      case "S": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 4) {
          out.push(
            rel ? cx + a[i] : a[i],
            rel ? cy + a[i + 1] : a[i + 1],
            rel ? cx + a[i + 2] : a[i + 2],
            rel ? cy + a[i + 3] : a[i + 3],
          );
          cx = out[out.length - 2];
          cy = out[out.length - 1];
        }
        abs.push({ type: "S", args: out });
        break;
      }
      case "Q": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 4) {
          out.push(
            rel ? cx + a[i] : a[i],
            rel ? cy + a[i + 1] : a[i + 1],
            rel ? cx + a[i + 2] : a[i + 2],
            rel ? cy + a[i + 3] : a[i + 3],
          );
          cx = out[out.length - 2];
          cy = out[out.length - 1];
        }
        abs.push({ type: "Q", args: out });
        break;
      }
      case "T": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 2) {
          cx = rel ? cx + a[i] : a[i];
          cy = rel ? cy + a[i + 1] : a[i + 1];
          out.push(cx, cy);
        }
        abs.push({ type: "T", args: out });
        break;
      }
      case "A": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 7) {
          const ex = rel ? cx + a[i + 5] : a[i + 5],
            ey = rel ? cy + a[i + 6] : a[i + 6];
          out.push(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], ex, ey);
          cx = ex;
          cy = ey;
        }
        abs.push({ type: "A", args: out });
        break;
      }
    }
  }
  return abs;
}

// ── Coordinate transform ──────────────────────────────────────────────────────

/**
 * Maps a single SVG user-unit point to machine mm coordinates.
 *
 * The canvas (ImportLayer) rotates around the centre of the bounding box
 * — (originalWidth/2, originalHeight/2) in SVG user units — so we must
 * centre the coordinates on that point before applying rotation, then
 * translate back to the object's machine-space position afterwards.
 *
 * obj.x / obj.y always refer to the LEFT and BOTTOM (or TOP, for top-*
 * origins) edge of the unrotated bounding box in machine mm.
 *
 * scaleX / scaleY are optional per-axis overrides (ratio lock off).
 * When absent both axes use obj.scale.
 */
export function transformPt(
  obj: VectorObject,
  config: MachineConfig,
  svgX: number,
  svgY: number,
): Pt {
  const sX = obj.scaleX ?? obj.scale;
  const sY = obj.scaleY ?? obj.scale;
  const halfW = (obj.originalWidth / 2) * sX;
  const halfH = (obj.originalHeight / 2) * sY;

  // Express the point as an offset from the object's centre in scaled SVG
  // space (SVG Y increases downward).
  let x = svgX * sX - halfW;
  let y = svgY * sY - halfH;

  if (obj.rotation !== 0) {
    const rad = (obj.rotation * Math.PI) / 180;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    // Clockwise rotation in Y-down SVG space (matches canvas rotate(deg)).
    [x, y] = [x * cos - y * sin, x * sin + y * cos];
  }

  // Re-anchor from object-centre offset to machine-space absolute position.
  // obj.x is the left edge, so the object centre X = obj.x + halfW.
  x += obj.x + halfW;

  if (config.origin === "bottom-left" || config.origin === "bottom-right") {
    // SVG Y increases downward; machine Y increases upward → negate y offset.
    // Object centre machine-Y = obj.y + halfH  (obj.y is the bottom edge).
    y = obj.y + halfH - y;
  } else {
    // top-* and center: SVG Y and machine Y share the same direction.
    y += obj.y + halfH;
  }

  if (config.origin === "bottom-right" || config.origin === "top-right")
    x = config.bedWidth - x;
  if (config.origin === "center") {
    x = x - config.bedWidth / 2;
    y = config.bedHeight / 2 - y;
  }
  return { x, y };
}

// ── Bezier subdivision ────────────────────────────────────────────────────────

const FLATNESS_SQ = 0.01;

export function cubicBezier(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): Pt[] {
  const pts: Pt[] = [];
  subdivideCubic(x0, y0, x1, y1, x2, y2, x3, y3, pts);
  pts.push({ x: x3, y: y3 });
  return pts;
}

function subdivideCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  out: Pt[],
): void {
  const ux = 3 * x1 - 2 * x0 - x3,
    uy = 3 * y1 - 2 * y0 - y3;
  const vx = 3 * x2 - 2 * x3 - x0,
    vy = 3 * y2 - 2 * y3 - y0;
  if (Math.max(ux * ux + uy * uy, vx * vx + vy * vy) <= FLATNESS_SQ * 16)
    return;
  const mx01x = (x0 + x1) / 2,
    mx01y = (y0 + y1) / 2;
  const mx12x = (x1 + x2) / 2,
    mx12y = (y1 + y2) / 2;
  const mx23x = (x2 + x3) / 2,
    mx23y = (y2 + y3) / 2;
  const mx012x = (mx01x + mx12x) / 2,
    mx012y = (mx01y + mx12y) / 2;
  const mx123x = (mx12x + mx23x) / 2,
    mx123y = (mx12y + mx23y) / 2;
  const midx = (mx012x + mx123x) / 2,
    midy = (mx012y + mx123y) / 2;
  subdivideCubic(x0, y0, mx01x, mx01y, mx012x, mx012y, midx, midy, out);
  out.push({ x: midx, y: midy });
  subdivideCubic(midx, midy, mx123x, mx123y, mx23x, mx23y, x3, y3, out);
}

export function quadBezier(
  x0: number,
  y0: number,
  cpx: number,
  cpy: number,
  x1: number,
  y1: number,
): Pt[] {
  const c1x = x0 + (2 / 3) * (cpx - x0),
    c1y = y0 + (2 / 3) * (cpy - y0);
  const c2x = x1 + (2 / 3) * (cpx - x1),
    c2y = y1 + (2 / 3) * (cpy - y1);
  return cubicBezier(x0, y0, c1x, c1y, c2x, c2y, x1, y1);
}

// ── SVG arc to cubics ─────────────────────────────────────────────────────────

export function arcToBeziers(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  xRot: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): Pt[] {
  if (x1 === x2 && y1 === y2) return [];
  if (rx === 0 || ry === 0) return [{ x: x2, y: y2 }];
  const phi = (xRot * Math.PI) / 180,
    cosPhi = Math.cos(phi),
    sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2,
    dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy,
    y1p = -sinPhi * dx + cosPhi * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  let rx2 = rx * rx,
    ry2 = ry * ry;
  const x1p2 = x1p * x1p,
    y1p2 = y1p * y1p;
  const lam = x1p2 / rx2 + y1p2 / ry2;
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
    rx2 = rx * rx;
    ry2 = ry * ry;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const sq = Math.max(
    0,
    (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2),
  );
  const coef = sign * Math.sqrt(sq);
  const cxp = (coef * rx * y1p) / ry,
    cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const n = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    return (
      (ux * vy - uy * vx < 0 ? -1 : 1) *
      Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / n)))
    );
  };

  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const segs = Math.ceil(Math.abs(dTheta) / (Math.PI / 2));
  const dt = dTheta / segs;
  const alpha = (4 / 3) * Math.tan(dt / 4);
  const pts: Pt[] = [];

  for (let i = 0; i < segs; i++) {
    const t1 = theta1 + i * dt,
      t2 = theta1 + (i + 1) * dt;
    const cos1 = Math.cos(t1),
      sin1 = Math.sin(t1),
      cos2 = Math.cos(t2),
      sin2 = Math.sin(t2);
    const bx0 = cx + cosPhi * rx * cos1 - sinPhi * ry * sin1;
    const by0 = cy + sinPhi * rx * cos1 + cosPhi * ry * sin1;
    const bx1 = bx0 - alpha * (cosPhi * rx * sin1 + sinPhi * ry * cos1);
    const by1 = by0 - alpha * (sinPhi * rx * sin1 - cosPhi * ry * cos1);
    const bx3 = cx + cosPhi * rx * cos2 - sinPhi * ry * sin2;
    const by3 = cy + sinPhi * rx * cos2 + cosPhi * ry * sin2;
    const bx2 = bx3 + alpha * (cosPhi * rx * sin2 + sinPhi * ry * cos2);
    const by2 = by3 + alpha * (sinPhi * rx * sin2 - cosPhi * ry * cos2);
    pts.push(...cubicBezier(bx0, by0, bx1, by1, bx2, by2, bx3, by3));
  }
  return pts;
}

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

// ── Rounded-corner smoothing ────────────────────────────────────────────────

const CORNER_EPS = 1e-6;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function leftNormal(vx: number, vy: number): Pt {
  return { x: -vy, y: vx };
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function intersectLines(p: Pt, r: Pt, q: Pt, s: Pt): Pt | null {
  const den = cross(r.x, r.y, s.x, s.y);
  if (Math.abs(den) <= CORNER_EPS) return null;
  const qpX = q.x - p.x;
  const qpY = q.y - p.y;
  const t = cross(qpX, qpY, s.x, s.y) / den;
  return { x: p.x + r.x * t, y: p.y + r.y * t };
}

interface RoundedCorner {
  entry: Pt;
  arc: Pt[]; // excludes entry, includes exit
}

function buildRoundedCorner(
  prev: Pt,
  curr: Pt,
  next: Pt,
  thresholdDeg: number,
  radiusMm: number,
): RoundedCorner | null {
  const inX = curr.x - prev.x;
  const inY = curr.y - prev.y;
  const outX = next.x - curr.x;
  const outY = next.y - curr.y;
  const inLen = Math.hypot(inX, inY);
  const outLen = Math.hypot(outX, outY);
  if (inLen <= CORNER_EPS || outLen <= CORNER_EPS) return null;

  const inUx = inX / inLen;
  const inUy = inY / inLen;
  const outUx = outX / outLen;
  const outUy = outY / outLen;

  const dot = clamp(inUx * outUx + inUy * outUy, -1, 1);
  const turnDeg = (Math.acos(dot) * 180) / Math.PI;
  if (turnDeg >= thresholdDeg) return null;
  if (turnDeg <= 1 || turnDeg >= 179) return null;

  // Tangency distance from the vertex along each leg for a fillet of radius r.
  const half = (turnDeg * Math.PI) / 360;
  const tanHalf = Math.tan(half);
  if (Math.abs(tanHalf) <= CORNER_EPS) return null;
  let tangency = radiusMm / tanHalf;
  const maxTangency = Math.min(inLen, outLen) * 0.49;
  if (maxTangency <= CORNER_EPS) return null;
  tangency = Math.min(tangency, maxTangency);

  const entry: Pt = {
    x: curr.x - inUx * tangency,
    y: curr.y - inUy * tangency,
  };
  const exit: Pt = {
    x: curr.x + outUx * tangency,
    y: curr.y + outUy * tangency,
  };

  const turnSign = Math.sign(cross(inUx, inUy, outUx, outUy));
  if (turnSign === 0) return null;

  const leftIn = leftNormal(inUx, inUy);
  const leftOut = leftNormal(outUx, outUy);
  const n1: Pt = { x: leftIn.x * turnSign, y: leftIn.y * turnSign };
  const n2: Pt = { x: leftOut.x * turnSign, y: leftOut.y * turnSign };

  const center = intersectLines(entry, n1, exit, n2);
  if (!center) return null;

  const startAng = Math.atan2(entry.y - center.y, entry.x - center.x);
  let endAng = Math.atan2(exit.y - center.y, exit.x - center.x);
  if (turnSign > 0 && endAng < startAng) endAng += Math.PI * 2;
  if (turnSign < 0 && endAng > startAng) endAng -= Math.PI * 2;

  const sweep = endAng - startAng;
  const segs = Math.max(2, Math.ceil(Math.abs(sweep) / ((Math.PI / 180) * 12)));
  const arc: Pt[] = [];
  const r = Math.hypot(entry.x - center.x, entry.y - center.y);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const a = startAng + sweep * t;
    arc.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  }

  return { entry, arc };
}

function roundSubpathCornersOpen(
  subpath: Subpath,
  thresholdDeg: number,
  radiusMm: number,
): Subpath {
  if (subpath.length < 3) return subpath.slice();
  const out: Subpath = [subpath[0]];

  for (let i = 1; i < subpath.length - 1; i++) {
    const prev = subpath[i - 1];
    const curr = subpath[i];
    const next = subpath[i + 1];
    const rounded = buildRoundedCorner(
      prev,
      curr,
      next,
      thresholdDeg,
      radiusMm,
    );

    if (!rounded) {
      out.push(curr);
      continue;
    }

    const last = out[out.length - 1];
    if (dist(last, rounded.entry) <= CORNER_EPS) {
      out[out.length - 1] = rounded.entry;
    } else {
      out.push(rounded.entry);
    }
    out.push(...rounded.arc);
  }

  out.push(subpath[subpath.length - 1]);
  return out;
}

/**
 * Smooths sharp polyline vertices by replacing eligible corners with
 * short circular arcs. The corner is rounded when the turn angle is below
 * `angleThresholdDeg`.
 */
export function roundSubpathCorners(
  subpath: Subpath,
  angleThresholdDeg: number,
  radiusMm: number,
): Subpath {
  if (subpath.length < 3) return subpath.slice();
  if (!Number.isFinite(radiusMm) || radiusMm <= 0) return subpath.slice();
  const threshold = clamp(angleThresholdDeg, 1, 179);

  const closed = dist(subpath[0], subpath[subpath.length - 1]) <= CORNER_EPS;
  if (!closed) {
    return roundSubpathCornersOpen(subpath, threshold, radiusMm);
  }

  // Closed loop: process every corner using wrap-around indexing so no corner
  // is ever left unrounded because it happened to be the seam point.
  if (subpath.length < 4) return subpath.slice();
  const core = subpath.slice(0, -1); // strip duplicate closing point
  const k = core.length;
  if (k < 3) return subpath.slice();

  const out: Pt[] = [];
  for (let i = 0; i < k; i++) {
    const prev = core[(i - 1 + k) % k];
    const curr = core[i];
    const next = core[(i + 1) % k];
    const rounded = buildRoundedCorner(prev, curr, next, threshold, radiusMm);
    if (!rounded) {
      out.push(curr);
    } else {
      if (
        out.length > 0 &&
        dist(out[out.length - 1], rounded.entry) <= CORNER_EPS
      ) {
        out[out.length - 1] = rounded.entry;
      } else {
        out.push(rounded.entry);
      }
      out.push(...rounded.arc);
    }
  }
  if (out.length > 0) out.push({ ...out[0] });
  return out;
}

// ── Hatch re-clip ─────────────────────────────────────────────────────────────

/** Ray-casting point-in-polygon test using the even-odd rule. */
function pointInPolygon(x: number, y: number, poly: Subpath): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    if (yi !== yj && yi > y !== yj > y) {
      const xInt = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < xInt) inside = !inside;
    }
  }
  return inside;
}

function pointOnSegment(p: Pt, a: Pt, b: Pt, eps: number): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const crossVal = Math.abs(abx * apy - aby * apx);
  if (crossVal > eps) return false;
  const dotVal = apx * abx + apy * aby;
  if (dotVal < -eps) return false;
  const abLenSq = abx * abx + aby * aby;
  if (dotVal - abLenSq > eps) return false;
  return true;
}

function pointOnPolygonEdge(p: Pt, poly: Subpath, eps: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (pointOnSegment(p, a, b, eps)) return true;
  }
  return false;
}

/**
 * Clips a straight line segment (p1→p2) against a closed polygon using the
 * even-odd fill rule.  Returns the sub-segments of p1→p2 that lie inside the
 * polygon.  Used to re-clip pre-computed hatch lines against a rounded outline
 * boundary after corner-rounding has been applied.
 */
export function clipSegmentToPolygon(
  p1: Pt,
  p2: Pt,
  polygon: Subpath,
): Subpath[] {
  if (polygon.length < 3) return [[p1, p2]];

  // Accept both closed (first==last) and open polygon rings.
  const ring =
    dist(polygon[0], polygon[polygon.length - 1]) <= CORNER_EPS
      ? polygon.slice(0, -1)
      : polygon.slice();
  if (ring.length < 3) return [[p1, p2]];

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.hypot(dx, dy) < CORNER_EPS) return [];

  // Collect all t-values (0..1 along the segment) where the segment crosses a
  // polygon edge, then evaluate even-odd membership for each interval midpoint.
  const ts: number[] = [0, 1];
  for (let i = 0; i < ring.length; i++) {
    const q1 = ring[i];
    const q2 = ring[(i + 1) % ring.length];
    const ex = q2.x - q1.x;
    const ey = q2.y - q1.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < CORNER_EPS) continue; // parallel edges
    const fx = q1.x - p1.x;
    const fy = q1.y - p1.y;
    const t = (fx * ey - fy * ex) / denom;
    const s = (fx * dy - fy * dx) / denom;
    if (
      t > -CORNER_EPS &&
      t < 1 + CORNER_EPS &&
      s > -CORNER_EPS &&
      s < 1 + CORNER_EPS
    ) {
      ts.push(clamp(t, 0, 1));
    }
  }

  ts.sort((a, b) => a - b);

  // De-duplicate near-identical crossings (common at polygon vertices).
  const uniqTs: number[] = [];
  for (const t of ts) {
    if (uniqTs.length === 0 || Math.abs(t - uniqTs[uniqTs.length - 1]) > 1e-7) {
      uniqTs.push(t);
    }
  }

  const result: Subpath[] = [];
  for (let i = 0; i < uniqTs.length - 1; i++) {
    if (uniqTs[i + 1] - uniqTs[i] < CORNER_EPS) continue;
    const tmid = (uniqTs[i] + uniqTs[i + 1]) / 2;
    const mid: Pt = { x: p1.x + tmid * dx, y: p1.y + tmid * dy };
    if (
      pointInPolygon(mid.x, mid.y, ring) ||
      pointOnPolygonEdge(mid, ring, 1e-7)
    ) {
      result.push([
        { x: p1.x + uniqTs[i] * dx, y: p1.y + uniqTs[i] * dy },
        { x: p1.x + uniqTs[i + 1] * dx, y: p1.y + uniqTs[i + 1] * dy },
      ]);
    }
  }
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
