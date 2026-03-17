/**
 * Hatch-fill generation for SVG paths.
 *
 * Takes a normalised, absolute path `d` string (SVG user units) and produces
 * an array of hatch-line path strings — parallel strokes at the requested
 * spacing and angle — clipped to the interior of the shape using an even-odd
 * scanline intersection algorithm.
 *
 * Curves (cubic, quadratic, arc) are flattened to polyline segments before
 * the scanline pass, reusing the same subdivision code as the G-code engine.
 *
 * Public API:
 *   generateHatchPaths(d, spacingUnits, angleDeg) → string[]
 */

import {
  tokenizePath,
  toAbsolute,
  cubicBezier,
  quadBezier,
  arcToBeziers,
} from "../../../workers/gcodeEngine";

// ── Internal types ────────────────────────────────────────────────────────────

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ── Path → segment list ────────────────────────────────────────────────────────

/**
 * Flattens a path `d` string into straight-line segments by subdividing
 * all curves.  Works in SVG user-unit space; no coordinate transform is
 * applied.
 */
function flattenPathToSegments(d: string): Seg[] {
  const segs: Seg[] = [];
  const abs = toAbsolute(tokenizePath(d));
  let cx = 0,
    cy = 0,
    startX = 0,
    startY = 0;
  let lastCpX = 0,
    lastCpY = 0;

  const addLine = (x: number, y: number) => {
    if (cx !== x || cy !== y) segs.push({ x1: cx, y1: cy, x2: x, y2: y });
    cx = x;
    cy = y;
  };

  for (const cmd of abs) {
    const a = cmd.args;
    switch (cmd.type) {
      case "M":
        cx = a[0];
        cy = a[1];
        startX = cx;
        startY = cy;
        lastCpX = cx;
        lastCpY = cy;
        for (let i = 2; i < a.length; i += 2) addLine(a[i], a[i + 1]);
        break;
      case "L":
        for (let i = 0; i < a.length; i += 2) addLine(a[i], a[i + 1]);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "H":
        for (let i = 0; i < a.length; i++) addLine(a[i], cy);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "V":
        for (let i = 0; i < a.length; i++) addLine(cx, a[i]);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "Z":
        if (cx !== startX || cy !== startY) addLine(startX, startY);
        cx = startX;
        cy = startY;
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
            addLine(p.x, p.y);
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
            addLine(p.x, p.y);
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
            addLine(p.x, p.y);
          lastCpX = a[i];
          lastCpY = a[i + 1];
        }
        break;
      case "T":
        for (let i = 0; i < a.length; i += 2) {
          const c1x = 2 * cx - lastCpX,
            c1y = 2 * cy - lastCpY;
          for (const p of quadBezier(cx, cy, c1x, c1y, a[i], a[i + 1]))
            addLine(p.x, p.y);
          lastCpX = c1x;
          lastCpY = c1y;
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
            addLine(p.x, p.y);
          // After an arc, smooth curve commands (S/T) should reflect from the
          // current point, not from a stale control point. Mirror behavior of
          // flattenToSubpaths in gcodeEngine by resetting last control point.
          lastCpX = cx;
          lastCpY = cy;
        }
        break;
    }
  }
  return segs;
}

// ── Scanline hatch ─────────────────────────────────────────────────────────────

function rotPt(
  x: number,
  y: number,
  cos: number,
  sin: number,
): { x: number; y: number } {
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * Generates hatch-fill path strings for a single closed SVG path.
 *
 * @param d            - Normalised, absolute path d-string (SVG user units)
 * @param spacingUnits - Distance between hatch lines in SVG user units
 * @param angleDeg     - Angle of hatch lines in degrees (0 = horizontal)
 * @returns Array of M…L path strings, one per hatch segment
 */
export function generateHatchPaths(
  d: string,
  spacingUnits: number,
  angleDeg: number,
): string[] {
  const segs = flattenPathToSegments(d);
  if (segs.length === 0) return [];

  // Rotate all segments by -angle so that the hatch lines become horizontal
  const rad = (angleDeg * Math.PI) / 180;
  const cosN = Math.cos(-rad),
    sinN = Math.sin(-rad);
  const cosP = Math.cos(rad),
    sinP = Math.sin(rad);

  const rotSegs = segs.map((s) => ({
    x1: rotPt(s.x1, s.y1, cosN, sinN).x,
    y1: rotPt(s.x1, s.y1, cosN, sinN).y,
    x2: rotPt(s.x2, s.y2, cosN, sinN).x,
    y2: rotPt(s.x2, s.y2, cosN, sinN).y,
  }));

  let minY = Infinity,
    maxY = -Infinity;
  for (const s of rotSegs) {
    if (s.y1 < minY) minY = s.y1;
    if (s.y1 > maxY) maxY = s.y1;
    if (s.y2 < minY) minY = s.y2;
    if (s.y2 > maxY) maxY = s.y2;
  }

  const paths: string[] = [];

  // Guard against non-finite or non-positive spacing, which would cause
  // the scanline loop below to become infinite (scanY would never advance
  // toward the termination condition).
  if (!Number.isFinite(spacingUnits) || spacingUnits <= 0) {
    return paths;
  }

  // Start half a spacing in from the top edge so we don't land exactly on a
  // boundary (which can cause degenerate double-intersections at vertices).
  for (
    let scanY = minY + spacingUnits / 2;
    scanY < maxY;
    scanY += spacingUnits
  ) {
    const xs: number[] = [];
    for (const s of rotSegs) {
      const { x1, y1, x2, y2 } = s;
      // Include lower endpoint, exclude upper to avoid double-counting shared
      // vertices between adjacent segments.
      if ((y1 <= scanY && scanY < y2) || (y2 <= scanY && scanY < y1)) {
        const t = (scanY - y1) / (y2 - y1);
        xs.push(x1 + t * (x2 - x1));
      }
    }
    if (xs.length < 2) continue;

    xs.sort((a, b) => a - b);

    // Even-odd fill rule: draw between pairs (0→1), (2→3), …
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const p1 = rotPt(xs[i], scanY, cosP, sinP);
      const p2 = rotPt(xs[i + 1], scanY, cosP, sinP);
      paths.push(
        `M${p1.x.toFixed(3)},${p1.y.toFixed(3)} L${p2.x.toFixed(3)},${p2.y.toFixed(3)}`,
      );
    }
  }

  return paths;
}
