import type { Pt } from "./geometryFlattening";

export type Subpath = Pt[];

export class OperationCancelledError extends Error {
  constructor(message = "Operation cancelled") {
    super(message);
    this.name = "OperationCancelledError";
  }
}

interface NearestNeighbourSortOptions {
  allowReverse?: boolean;
}

interface CooperativeSortOptions extends NearestNeighbourSortOptions {
  shouldCancel?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
  yieldIntervalMs?: number;
}

interface CooperativeJoinOptions {
  shouldCancel?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
  yieldIntervalMs?: number;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function throwIfCancelled(shouldCancel?: () => boolean): void {
  if (shouldCancel?.()) {
    throw new OperationCancelledError();
  }
}

/**
 * Subpath start points bucketed into a sqrt(n)×sqrt(n) grid. Each step of
 * the sort scans it ring by ring outward from the pen; every ring is scanned,
 * because a subpath may be drawn reversed and its end — which the grid does
 * not index — can be near the pen however far away its start is.
 */
interface StartGrid {
  cells: number[][];
  cols: number;
  rows: number;
  xMin: number;
  yMin: number;
  cw: number;
  ch: number;
}

function buildStartGrid(subpaths: Subpath[], shouldCancel?: () => boolean): StartGrid {
  const n = subpaths.length;
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

  const cells: number[][] = Array.from({ length: rows * cols }, () => []);
  for (let i = 0; i < n; i++) {
    throwIfCancelled(shouldCancel);
    const { x, y } = subpaths[i][0];
    const c = Math.min(cols - 1, Math.floor((x - xMin) / cw));
    const r = Math.min(rows - 1, Math.floor((y - yMin) / ch));
    cells[r * cols + c].push(i);
  }
  return { cells, cols, rows, xMin, yMin, cw, ch };
}

/** The cells of one ring around (cc, cr) — only its border, since the inner
 * rings were scanned before it. */
function ringCells(grid: StartGrid, cc: number, cr: number, ring: number): number[][] {
  const rLo = Math.max(0, cr - ring),
    rHi = Math.min(grid.rows - 1, cr + ring);
  const cLo = Math.max(0, cc - ring),
    cHi = Math.min(grid.cols - 1, cc + ring);
  const out: number[][] = [];
  for (let gr = rLo; gr <= rHi; gr++) {
    for (let gc = cLo; gc <= cHi; gc++) {
      if (ring > 0 && gr > rLo && gr < rHi && gc > cLo && gc < cHi) continue;
      out.push(grid.cells[gr * grid.cols + gc]);
    }
  }
  return out;
}

interface SortState {
  subpaths: Subpath[];
  allowReverse: boolean;
  visited: Uint8Array;
  sorted: Subpath[];
  curX: number;
  curY: number;
  bestIdx: number;
  bestReverse: boolean;
  bestDist: number;
}

function newSortState(subpaths: Subpath[], allowReverse: boolean): SortState {
  const n = subpaths.length;
  return {
    subpaths,
    allowReverse,
    visited: new Uint8Array(n),
    sorted: new Array(n),
    curX: 0,
    curY: 0,
    bestIdx: -1,
    bestReverse: false,
    bestDist: Infinity,
  };
}

/** Where the pen is in the grid, and how many rings to scan from there. */
function scanOrigin(grid: StartGrid, state: SortState) {
  state.bestIdx = -1;
  state.bestReverse = false;
  state.bestDist = Infinity;
  return {
    cc: Math.min(grid.cols - 1, Math.max(0, Math.floor((state.curX - grid.xMin) / grid.cw))),
    cr: Math.min(grid.rows - 1, Math.max(0, Math.floor((state.curY - grid.yMin) / grid.ch))),
    maxRing: Math.max(grid.cols, grid.rows),
  };
}

/** Considers each unvisited subpath in one cell, from either end when
 * reversing is allowed, keeping the nearest so far. */
function scanCell(cell: number[], state: SortState): void {
  const { subpaths, visited, curX, curY } = state;
  for (const idx of cell) {
    if (visited[idx]) continue;
    const subpath = subpaths[idx];
    const start = subpath[0];
    const end = subpath[subpath.length - 1];
    const dStart = (start.x - curX) ** 2 + (start.y - curY) ** 2;
    const dEnd = state.allowReverse ? (end.x - curX) ** 2 + (end.y - curY) ** 2 : Infinity;

    let d = dStart;
    let reverse = false;
    if (Number.isFinite(dEnd) && (!Number.isFinite(d) || dEnd < d)) {
      d = dEnd;
      reverse = true;
    }
    if (!Number.isFinite(d)) continue;

    if (d < state.bestDist) {
      state.bestDist = d;
      state.bestIdx = idx;
      state.bestReverse = reverse;
    }
  }
}

/** Draws the nearest subpath found (or, if none was, the first unvisited
 * one) as step `s`, and moves the pen to its end. */
function takeStep(state: SortState, s: number): void {
  const { visited, subpaths, sorted } = state;
  if (state.bestIdx === -1) state.bestIdx = visited.indexOf(0);
  visited[state.bestIdx] = 1;
  sorted[s] = state.bestReverse ? [...subpaths[state.bestIdx]].reverse() : subpaths[state.bestIdx];
  const last = sorted[s][sorted[s].length - 1];
  state.curX = last.x;
  state.curY = last.y;
}

/** Orders subpaths greedily, each next the one nearest the pen. */
export function nearestNeighbourSort(
  subpaths: Subpath[],
  options?: NearestNeighbourSortOptions,
): Subpath[] {
  if (subpaths.length === 0) return [];
  if (subpaths.length === 1) return [subpaths[0]];
  const grid = buildStartGrid(subpaths);
  const state = newSortState(subpaths, options?.allowReverse ?? true);

  for (let s = 0; s < subpaths.length; s++) {
    const { cc, cr, maxRing } = scanOrigin(grid, state);
    for (let ring = 0; ring <= maxRing; ring++) {
      for (const cell of ringCells(grid, cc, cr, ring)) scanCell(cell, state);
    }
    takeStep(state, s);
  }
  return state.sorted;
}

/**
 * `nearestNeighbourSort` for large jobs: checks for cancellation and yields
 * to the event loop as it goes, and reports progress per subpath placed.
 */
export async function nearestNeighbourSortCooperative(
  subpaths: Subpath[],
  options?: CooperativeSortOptions,
): Promise<Subpath[]> {
  if (subpaths.length === 0) return [];
  if (subpaths.length === 1) return [subpaths[0]];
  const shouldCancel = options?.shouldCancel;
  const yieldIntervalMs = Math.max(4, options?.yieldIntervalMs ?? 16);
  const grid = buildStartGrid(subpaths, shouldCancel);
  const state = newSortState(subpaths, options?.allowReverse ?? true);
  let lastYieldAt = Date.now();

  for (let s = 0; s < subpaths.length; s++) {
    throwIfCancelled(shouldCancel);
    const { cc, cr, maxRing } = scanOrigin(grid, state);
    for (let ring = 0; ring <= maxRing; ring++) {
      for (const cell of ringCells(grid, cc, cr, ring)) {
        scanCell(cell, state);
        throwIfCancelled(shouldCancel);
        if (Date.now() - lastYieldAt >= yieldIntervalMs) {
          lastYieldAt = Date.now();
          await yieldToEventLoop();
        }
      }
    }
    takeStep(state, s);
    options?.onProgress?.(s + 1, subpaths.length);
  }
  return state.sorted;
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

export async function joinSubpathsCooperative(
  subpaths: Subpath[],
  toleranceMm: number,
  options?: CooperativeJoinOptions,
): Promise<Subpath[]> {
  if (subpaths.length === 0) return [];
  const tolSq = toleranceMm * toleranceMm;
  const result: Subpath[] = [];
  let current = subpaths[0].slice();
  const total = Math.max(1, subpaths.length - 1);
  const yieldIntervalMs = Math.max(4, options?.yieldIntervalMs ?? 16);
  let lastYieldAt = Date.now();

  for (let i = 1; i < subpaths.length; i++) {
    throwIfCancelled(options?.shouldCancel);

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

    options?.onProgress?.(i, total);
    if (Date.now() - lastYieldAt >= yieldIntervalMs) {
      lastYieldAt = Date.now();
      await yieldToEventLoop();
    }
  }

  result.push(current);
  return result;
}
