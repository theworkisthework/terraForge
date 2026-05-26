import type { Pt } from "./geometryFlattening";

type Subpath = Pt[];

interface VinylWeedBorderSettings {
  marginMM: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function applyVinylWeedBorder(
  subpaths: Subpath[],
  settings: VinylWeedBorderSettings,
): Subpath[] {
  if (settings.marginMM <= 0) {
    return subpaths;
  }

  const bounds = computeBounds(subpaths);
  if (!bounds) {
    return subpaths;
  }

  const border = createBorder(bounds, settings.marginMM);
  return [...subpaths, border];
}

function computeBounds(subpaths: Subpath[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const subpath of subpaths) {
    for (const point of subpath) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        continue;
      }
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }

  if (!Number.isFinite(minX)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function createBorder(bounds: Bounds, marginMM: number): Subpath {
  const left = bounds.minX - marginMM;
  const right = bounds.maxX + marginMM;
  const top = bounds.minY - marginMM;
  const bottom = bounds.maxY + marginMM;

  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
}
