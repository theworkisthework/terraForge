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

/** A grid of about sqrt(n)×sqrt(n) cells laid over a set of points. */
interface GridShape {
  cols: number;
  rows: number;
  xMin: number;
  yMin: number;
  cw: number;
  ch: number;
}

function gridShape(points: Pt[], n: number): GridShape {
  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity;
  for (const { x, y } of points) {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  xMax += 1e-9;
  yMax += 1e-9;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(Math.sqrt(n)));
  return {
    cols,
    rows,
    xMin,
    yMin,
    cw: (xMax - xMin) / cols,
    ch: (yMax - yMin) / rows,
  };
}

const colOf = (g: GridShape, x: number) =>
  Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.xMin) / g.cw)));
const rowOf = (g: GridShape, y: number) =>
  Math.min(g.rows - 1, Math.max(0, Math.floor((y - g.yMin) / g.ch)));

/**
 * Subpath ends bucketed by position: starts, and ends too when a subpath may
 * be drawn reversed. Each step of the sort scans it ring by ring outward from
 * the pen, and stops once every cell further out is further away than the
 * nearest end found so far.
 */
interface SearchGrid extends GridShape {
  cells: number[][];
}

function buildSearchGrid(
  subpaths: Subpath[],
  allowReverse: boolean,
  shouldCancel?: () => boolean,
): SearchGrid {
  const ends: Pt[] = [];
  for (const sp of subpaths) ends.push(sp[0], sp[sp.length - 1]);
  const shape = gridShape(ends, subpaths.length);
  const cells: number[][] = Array.from(
    { length: shape.rows * shape.cols },
    () => [],
  );
  const add = (i: number, { x, y }: Pt) => {
    if (Number.isFinite(x) && Number.isFinite(y))
      cells[rowOf(shape, y) * shape.cols + colOf(shape, x)].push(i);
  };
  for (let i = 0; i < subpaths.length; i++) {
    throwIfCancelled(shouldCancel);
    const sp = subpaths[i];
    add(i, sp[0]);
    if (allowReverse && sp.length > 1) add(i, sp[sp.length - 1]);
  }
  return { ...shape, cells };
}

/** The cells exactly `ring` steps from (cc, cr) that lie in the grid, row by
 * row. Only the ring's own cells are visited (not the square inside it,
 * which earlier rings covered), so a whole scan touches each cell once. */
function ringCells(
  grid: SearchGrid,
  cc: number,
  cr: number,
  ring: number,
): number[][] {
  const { cols, rows, cells } = grid;
  const top = cr - ring,
    bottom = cr + ring,
    left = cc - ring,
    right = cc + ring;
  const rLo = Math.max(0, top),
    rHi = Math.min(rows - 1, bottom);
  const cLo = Math.max(0, left),
    cHi = Math.min(cols - 1, right);
  const out: number[][] = [];
  for (let gr = rLo; gr <= rHi; gr++) {
    if (gr === top || gr === bottom) {
      for (let gc = cLo; gc <= cHi; gc++) out.push(cells[gr * cols + gc]);
    } else {
      if (left >= 0) out.push(cells[gr * cols + left]);
      if (right < cols) out.push(cells[gr * cols + right]);
    }
  }
  return out;
}

/** How near to (x, y) a point could be in a cell more than `ring` steps from
 * (cc, cr); Infinity when there are no such cells. A little under the true
 * bound, so rounding never stops a search early. */
function beyondRing(
  grid: SearchGrid,
  cc: number,
  cr: number,
  ring: number,
  x: number,
  y: number,
): number {
  let bound = Infinity;
  if (cc - ring > 0)
    bound = Math.min(bound, x - (grid.xMin + (cc - ring) * grid.cw));
  if (cc + ring < grid.cols - 1)
    bound = Math.min(bound, grid.xMin + (cc + ring + 1) * grid.cw - x);
  if (cr - ring > 0)
    bound = Math.min(bound, y - (grid.yMin + (cr - ring) * grid.ch));
  if (cr + ring < grid.rows - 1)
    bound = Math.min(bound, grid.yMin + (cr + ring + 1) * grid.ch - y);
  return bound - ((grid.cw + grid.ch) * 1e-6 + 1e-9);
}

/**
 * Sort state. Of subpaths equally near the pen, the sort takes the one it
 * would meet first scanning a grid of start points outward from the pen —
 * ring, then row, then column, then input order — which keeps its output
 * the same as earlier versions that scanned the whole grid that way.
 */
interface SortState {
  subpaths: Subpath[];
  allowReverse: boolean;
  visited: Uint8Array;
  sorted: Subpath[];
  curX: number;
  curY: number;
  /** The start-point grid that decides ties, and each start's cell in it. */
  tieGrid: GridShape;
  startCol: Float64Array;
  startRow: Float64Array;
  penCol: number;
  penRow: number;
  bestIdx: number;
  bestReverse: boolean;
  bestDist: number;
  bestRing: number;
}

function newSortState(subpaths: Subpath[], allowReverse: boolean): SortState {
  const n = subpaths.length;
  const tieGrid = gridShape(
    subpaths.map((sp) => sp[0]),
    n,
  );
  const startCol = new Float64Array(n);
  const startRow = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const { x, y } = subpaths[i][0];
    startCol[i] = Math.min(
      tieGrid.cols - 1,
      Math.floor((x - tieGrid.xMin) / tieGrid.cw),
    );
    startRow[i] = Math.min(
      tieGrid.rows - 1,
      Math.floor((y - tieGrid.yMin) / tieGrid.ch),
    );
  }
  return {
    subpaths,
    allowReverse,
    visited: new Uint8Array(n),
    sorted: new Array(n),
    curX: 0,
    curY: 0,
    tieGrid,
    startCol,
    startRow,
    penCol: 0,
    penRow: 0,
    bestIdx: -1,
    bestReverse: false,
    bestDist: Infinity,
    bestRing: Infinity,
  };
}

/** Clears the last step's pick, and returns the pen's cell in `grid`. */
function scanOrigin(grid: SearchGrid, state: SortState) {
  state.bestIdx = -1;
  state.bestReverse = false;
  state.bestDist = Infinity;
  state.bestRing = Infinity;
  state.penCol = colOf(state.tieGrid, state.curX);
  state.penRow = rowOf(state.tieGrid, state.curY);
  return { cc: colOf(grid, state.curX), cr: rowOf(grid, state.curY) };
}

/** Whether `idx`, at `ring` from the pen, comes before the best so far
 * among equally near subpaths. */
function precedesBest(state: SortState, idx: number, ring: number): boolean {
  if (ring !== state.bestRing) return ring < state.bestRing;
  const b = state.bestIdx;
  if (state.startRow[idx] !== state.startRow[b])
    return state.startRow[idx] < state.startRow[b];
  if (state.startCol[idx] !== state.startCol[b])
    return state.startCol[idx] < state.startCol[b];
  return idx < b;
}

/** Considers each unvisited subpath in one cell, from either end when
 * reversing is allowed, keeping the nearest so far. Drops visited subpaths
 * from the cell as it goes. */
function scanCell(cell: number[], state: SortState): void {
  const { subpaths, visited, curX, curY } = state;
  let kept = 0;
  for (let k = 0; k < cell.length; k++) {
    const idx = cell[k];
    if (visited[idx]) continue;
    cell[kept++] = idx;
    const subpath = subpaths[idx];
    const start = subpath[0];
    const end = subpath[subpath.length - 1];
    const dStart = (start.x - curX) ** 2 + (start.y - curY) ** 2;
    const dEnd = state.allowReverse
      ? (end.x - curX) ** 2 + (end.y - curY) ** 2
      : Infinity;

    let d = dStart;
    let reverse = false;
    if (Number.isFinite(dEnd) && (!Number.isFinite(d) || dEnd < d)) {
      d = dEnd;
      reverse = true;
    }
    if (!Number.isFinite(d) || d > state.bestDist) continue;

    const ring = Math.max(
      Math.abs(state.startCol[idx] - state.penCol),
      Math.abs(state.startRow[idx] - state.penRow),
    );
    if (d === state.bestDist && !precedesBest(state, idx, ring)) continue;
    state.bestDist = d;
    state.bestIdx = idx;
    state.bestReverse = reverse;
    state.bestRing = ring;
  }
  cell.length = kept;
}

/** Whether nothing beyond `ring` could be nearer than the best found. */
function searchDone(
  grid: SearchGrid,
  state: SortState,
  cc: number,
  cr: number,
  ring: number,
): boolean {
  const bound = beyondRing(grid, cc, cr, ring, state.curX, state.curY);
  // NaN (a pen at a non-finite point) means nothing can be found.
  if (!(bound < Infinity)) return true;
  return bound > 0 && bound * bound > state.bestDist;
}

/** Draws the nearest subpath found (or, if none was, the first unvisited
 * one) as step `s`, and moves the pen to its end. */
function takeStep(state: SortState, s: number): void {
  const { visited, subpaths, sorted } = state;
  if (state.bestIdx === -1) state.bestIdx = visited.indexOf(0);
  visited[state.bestIdx] = 1;
  sorted[s] = state.bestReverse
    ? [...subpaths[state.bestIdx]].reverse()
    : subpaths[state.bestIdx];
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
  const allowReverse = options?.allowReverse ?? true;
  const grid = buildSearchGrid(subpaths, allowReverse);
  const state = newSortState(subpaths, allowReverse);

  for (let s = 0; s < subpaths.length; s++) {
    const { cc, cr } = scanOrigin(grid, state);
    for (let ring = 0; ; ring++) {
      for (const cell of ringCells(grid, cc, cr, ring)) scanCell(cell, state);
      if (searchDone(grid, state, cc, cr, ring)) break;
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
  const allowReverse = options?.allowReverse ?? true;
  const grid = buildSearchGrid(subpaths, allowReverse, shouldCancel);
  const state = newSortState(subpaths, allowReverse);
  let lastYieldAt = Date.now();

  for (let s = 0; s < subpaths.length; s++) {
    throwIfCancelled(shouldCancel);
    const { cc, cr } = scanOrigin(grid, state);
    for (let ring = 0; ; ring++) {
      for (const cell of ringCells(grid, cc, cr, ring)) {
        scanCell(cell, state);
        throwIfCancelled(shouldCancel);
        if (Date.now() - lastYieldAt >= yieldIntervalMs) {
          lastYieldAt = Date.now();
          await yieldToEventLoop();
        }
      }
      if (searchDone(grid, state, cc, cr, ring)) break;
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
