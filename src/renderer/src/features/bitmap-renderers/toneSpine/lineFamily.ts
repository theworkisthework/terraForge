import type { SpineStrand } from "./engine";

/**
 * Where an infinite line `base + t * dir` (|dir| = 1) enters and leaves the
 * `[0,width] x [0,height]` rectangle, as a [tMin, tMax] arc-length range, or
 * null if the line misses the rectangle entirely. Liang-Barsky clipping
 * against an unbounded parameter range, so it handles axis-aligned lines
 * (where a naive edge-by-edge division would divide by zero) uniformly.
 */
export function clipLineToRect(
  base: { x: number; y: number },
  dir: { x: number; y: number },
  width: number,
  height: number,
): [number, number] | null {
  const bound = 2 * Math.hypot(width, height);
  let t0 = -bound;
  let t1 = bound;
  const edges: [number, number][] = [
    [-dir.x, base.x - 0],
    [dir.x, width - base.x],
    [-dir.y, base.y - 0],
    [dir.y, height - base.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  return t0 > t1 ? null : [t0, t1];
}

function generateLineStrand(
  base: { x: number; y: number },
  dir: { x: number; y: number },
  normal: { x: number; y: number },
  tRange: [number, number],
  targetSegmentLength: number,
): SpineStrand {
  const [tMin, tMax] = tRange;
  const span = tMax - tMin;
  const steps = Math.max(1, Math.ceil(span / Math.max(targetSegmentLength, 0.01)));
  const points: SpineStrand = [];
  for (let i = 0; i <= steps; i++) {
    const t = tMin + (i / steps) * span;
    points.push({ x: base.x + t * dir.x, y: base.y + t * dir.y, nx: normal.x, ny: normal.y });
  }
  return points;
}

/**
 * Parallel lines perpendicular to `angleRad`, spaced evenly and anchored so
 * one line passes exactly through `(originX, originY)`, each clipped to the
 * `[0,width] x [0,height]` rectangle. Shared by the raster-lines renderer
 * (one call) and the isometric-grid renderer (three calls, 60° apart).
 */
export function generateLineFamilyStrands({
  originX,
  originY,
  angleRad,
  spacing,
  width,
  height,
  targetSegmentLength,
}: {
  originX: number;
  originY: number;
  angleRad: number;
  spacing: number;
  width: number;
  height: number;
  targetSegmentLength: number;
}): SpineStrand[] {
  const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const normal = { x: -Math.sin(angleRad), y: Math.cos(angleRad) };

  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width, y: height },
  ];
  const offsets = corners.map((c) => (c.x - originX) * normal.x + (c.y - originY) * normal.y);
  const offsetMin = Math.min(...offsets);
  const offsetMax = Math.max(...offsets);

  const strands: SpineStrand[] = [];
  const firstOffset = Math.ceil(offsetMin / spacing) * spacing;
  for (let offset = firstOffset; offset <= offsetMax; offset += spacing) {
    const base = { x: originX + offset * normal.x, y: originY + offset * normal.y };
    const tRange = clipLineToRect(base, dir, width, height);
    if (!tRange) continue;
    strands.push(generateLineStrand(base, dir, normal, tRange, targetSegmentLength));
  }
  return strands;
}
