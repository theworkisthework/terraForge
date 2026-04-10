import type { MachineConfig } from "../../../types";
import type { Pt } from "./geometryFlattening";

export type Subpath = Pt[];

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
      if (q < 0) return null;
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
 * Clips polyline subpaths against [xMin, xMax] × [yMin, yMax] in machine mm.
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
        if (current.length >= 2) result.push(current);
        current = [];
        continue;
      }

      const [t0, t1] = clip;

      if (t0 > 1e-9) {
        if (current.length >= 2) result.push(current);
        current = [interp(p0, p1, t0)];
      } else if (current.length === 0) {
        current.push(p0);
      }
      current.push(interp(p0, p1, t1));

      if (t1 < 1 - 1e-9) {
        if (current.length >= 2) result.push(current);
        current = [];
      }
    }

    if (current.length >= 2) result.push(current);
  }

  return result;
}

/**
 * Clips subpaths against the machine bed rectangle implied by config.
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
