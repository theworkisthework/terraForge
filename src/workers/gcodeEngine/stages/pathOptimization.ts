import type { Pt } from "./geometryFlattening";

export type Subpath = Pt[];

// Uses a sqrt(n)×sqrt(n) spatial grid so each lookup is O(1) amortised.
export function nearestNeighbourSort(subpaths: Subpath[]): Subpath[] {
  if (subpaths.length === 0) return [];
  const n = subpaths.length;
  if (n === 1) return [subpaths[0]];

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
  yMax += 1e-9;

  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cw = (xMax - xMin) / cols;
  const ch = (yMax - yMin) / rows;
  const minCell = Math.min(cw, ch);

  const cells: number[][] = Array.from({ length: rows * cols }, () => []);
  for (let i = 0; i < n; i++) {
    const { x, y } = subpaths[i][0];
    const c = Math.min(cols - 1, Math.floor((x - xMin) / cw));
    const r = Math.min(rows - 1, Math.floor((y - yMin) / ch));
    cells[r * cols + c].push(i);
  }

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
      current.push(...next);
    } else {
      result.push(current);
      current = next.slice();
    }
  }
  result.push(current);
  return result;
}