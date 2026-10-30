// ── G-code toolpath parser ────────────────────────────────────────────────────
//
// Converts a G-code text file into compact typed-array geometry:
//   cutPaths   — array of Float32Array sub-paths for G1/G2/G3 feed moves
//   rapidPaths — single flat Float32Array of [x0,y0,x1,y1,...] quad pairs for G0 rapids
//
// Coordinates are in millimetres in the G-code work coordinate space.
// Using typed arrays instead of SVG path strings:
//   - eliminates multi-megabyte string allocations for large files
//   - enables O(n) LOD filtering at canvas render time (skip sub-pixel segments)
//   - reduces memory by ~3× vs equivalent UTF-16 path strings
//
// Supported:
//   G0, G1        — linear rapid / feed
//   G2, G3        — arcs (approximated as straight lines for now)
//   G20 / G21     — inch / mm units
//   G90 / G91     — absolute / relative positioning
//   N<number>     — line numbers (parsed and counted)
//   ; ...  ( )    — comments stripped (except terraForge `;@tf ...` markers)

interface ToolpathMetadata {
  color?: string;
  layer?: string;
  dip?: string;
}

function decodeMarkerValue(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, "%20"));
}

function parseTfMarker(comment: string): ToolpathMetadata | null {
  const trimmed = comment.trim();
  if (!trimmed.toLowerCase().startsWith("@tf")) return null;

  const meta: ToolpathMetadata = {};
  const tokens = trimmed
    .slice(3)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const eqIndex = token.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = token.slice(0, eqIndex).toLowerCase();
    const rawValue = token.slice(eqIndex + 1);
    if (!rawValue) continue;

    let value: string;
    try {
      value = decodeMarkerValue(rawValue).trim();
    } catch {
      continue;
    }
    if (!value) continue;

    if (key === "color") meta.color = value;
    else if (key === "layer") meta.layer = value;
    else if (key === "dip") meta.dip = value;
  }

  return meta;
}

/** A single linear motion segment extracted from G-code.
 *  Coordinates are in machine work-coordinate mm, matching the G-code values
 *  directly — the same space reported by FluidNC's WPos status field. */
export interface GcodeSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: "cut" | "rapid";
  color?: string;
  layer?: string;
  dip?: string;
  /** 1-indexed sequential line number of the source G-code line that produced
   *  this segment.  Matches the line counter FluidNC reports in Ln:N,Total
   *  status messages, enabling reliable progress tracking without coordinate
   *  matching. */
  lineNum: number;
  /** Active feedrate (mm/min) at this line, from the last F-word seen. 0/undefined if none seen yet. */
  feed?: number;
}

export interface GcodeToolpath {
  /** Feed-move sub-paths (pen down).  Each Float32Array is one continuous
   *  stroke: [x0,y0, x1,y1, x2,y2, ...].  A new array begins wherever the
   *  pen lifted between cuts (i.e. a G0 rapid or initial pen-up gap). */
  cutPaths: Float32Array[];
  /** Optional per-cut-subpath color metadata (aligned by index with cutPaths). */
  cutPathColors?: Array<string | null>;
  /** Rapid-move segments (pen up), packed as flat quads:
   *  [x_from, y_from, x_to, y_to,  x_from, y_from, x_to, y_to, ...].
   *  Stride = 4 (one segment per group of four values). */
  rapidPaths: Float32Array;
  /** Optional per-rapid-segment color metadata (aligned with rapidPaths stride-4 segments). */
  rapidColors?: Array<string | null>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  lineCount: number;
  /** Individual motion segments used for live plot-progress tracking.
   *  Optional so that hand-crafted test objects without this field still
   *  satisfy the type (additive addition). */
  segments?: GcodeSegment[];
  /** Approximate file size in bytes (gcode string byte length). */
  fileSizeBytes: number;
  /** Total length of all feed (G1/G2/G3) move segments in mm. */
  totalCutDistance: number;
  /** Total length of all rapid (G0) move segments in mm. */
  totalRapidDistance: number;
  /** Last F-word feedrate seen in the file, in mm/min. 0 if none specified. */
  feedrate: number;
}

/** One line of G-code: any terraForge metadata marker in its comment, and
 * its letter/number words with comments and block-delete removed. */
function readLine(rawLine: string): { marker: ToolpathMetadata | null; words: [string, number][] } {
  const noParen = rawLine.replace(/^\//, "").replace(/\([^)]*\)/g, "");
  const commentStart = noParen.indexOf(";");
  const marker = commentStart >= 0 ? parseTfMarker(noParen.slice(commentStart + 1)) : null;

  const line = noParen.replace(/;.*$/, "").trim().toUpperCase();
  const words: [string, number][] = [];
  if (!line) return { marker, words };
  const rx = /([A-Z])([-+]?\d*\.?\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(line)) !== null) words.push([m[1], parseFloat(m[2])]);
  return { marker, words };
}

interface ModalState {
  /** 0 = G0 (rapid), 1–3 = G1–G3 (cuts; arcs approximated as straight lines). */
  motionMode: number;
  inMillimeters: boolean;
  isAbsolute: boolean;
}

/** The modal state each G-code sets, rounded to one decimal (G20.1 etc.). */
const MODAL_GCODES: Record<number, Partial<ModalState>> = {
  0: { motionMode: 0 },
  1: { motionMode: 1 },
  2: { motionMode: 2 },
  3: { motionMode: 3 },
  20: { inMillimeters: false },
  21: { inMillimeters: true },
  90: { isAbsolute: true },
  91: { isAbsolute: false },
};

function applyModalGcodes(words: [string, number][], modal: ModalState): void {
  for (const [letter, value] of words) {
    if (letter !== "G") continue;
    Object.assign(modal, MODAL_GCODES[Math.round(value * 10) / 10]);
  }
}

/** What the parser builds up line by line. */
interface ParseState {
  x: number;
  y: number;
  cutSubPaths: number[][];
  cutPathColors: Array<string | null>;
  /** The open cut sub-path; a rapid closes it. */
  currentCutPath: number[] | null;
  rapidData: number[];
  rapidColors: Array<string | null>;
  segments: GcodeSegment[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  totalCutDistance: number;
  totalRapidDistance: number;
}

/** Records a move from the current point to (nx, ny): as a rapid quad, or
 * appended to the open cut sub-path (starting one if a rapid closed it). */
function recordMove(state: ParseState, nx: number, ny: number, rapid: boolean, color: string | null): void {
  const { x, y } = state;
  const b = state.bounds;
  if (!b) state.bounds = { minX: nx, maxX: nx, minY: ny, maxY: ny };
  else {
    if (nx < b.minX) b.minX = nx;
    if (nx > b.maxX) b.maxX = nx;
    if (ny < b.minY) b.minY = ny;
    if (ny > b.maxY) b.maxY = ny;
  }

  const segDist = Math.sqrt((nx - x) ** 2 + (ny - y) ** 2);
  if (rapid) {
    state.totalRapidDistance += segDist;
    state.rapidData.push(x, y, nx, ny);
    state.rapidColors.push(color);
    state.currentCutPath = null;
  } else {
    state.totalCutDistance += segDist;
    if (state.currentCutPath === null) {
      state.currentCutPath = [x, y];
      state.cutSubPaths.push(state.currentCutPath);
      state.cutPathColors.push(color);
    }
    state.currentCutPath.push(nx, ny);
  }
  state.x = nx;
  state.y = ny;
}

export function parseGcode(gcode: string): GcodeToolpath {
  const modal: ModalState = { motionMode: 0, inMillimeters: true, isAbsolute: true };
  const active: { color: string | null; layer: string | null; dip: string | null } = { color: null, layer: null, dip: null };
  const state: ParseState = {
    x: 0,
    y: 0,
    cutSubPaths: [],
    cutPathColors: [],
    currentCutPath: null,
    rapidData: [],
    rapidColors: [],
    segments: [],
    bounds: null,
    totalCutDistance: 0,
    totalRapidDistance: 0,
  };
  let lineCount = 0;
  let feedrate = 0;

  for (const rawLine of gcode.split("\n")) {
    lineCount++;
    const { marker, words } = readLine(rawLine);
    if (marker?.color !== undefined) active.color = marker.color;
    if (marker?.layer !== undefined) active.layer = marker.layer;
    if (marker?.dip !== undefined) active.dip = marker.dip;
    if (!words.length) continue;

    applyModalGcodes(words, modal);
    const word = (letter: string) => words.find(([l]) => l === letter)?.[1];
    const xw = word("X");
    const yw = word("Y");
    // Skip lines with no X/Y motion
    if (xw === undefined && yw === undefined) continue;

    // Inches (G20) are converted to millimetres, feedrate included.
    const scale = modal.inMillimeters ? 1 : 25.4;
    const fw = word("F");
    if (fw !== undefined) feedrate = fw * scale;
    const along = (w: number | undefined, from: number) =>
      w === undefined ? from : modal.isAbsolute ? w * scale : from + w * scale;
    const nx = along(xw, state.x);
    const ny = along(yw, state.y);
    const rapid = modal.motionMode === 0;

    // Recorded for live plot-progress tracking.
    state.segments.push({
      from: { x: state.x, y: state.y },
      to: { x: nx, y: ny },
      type: rapid ? "rapid" : "cut",
      color: active.color ?? undefined,
      layer: active.layer ?? undefined,
      dip: active.dip ?? undefined,
      lineNum: lineCount,
      feed: feedrate || undefined,
    });
    recordMove(state, nx, ny, rapid, active.color);
  }

  return {
    cutPaths: state.cutSubPaths.map((pts) => new Float32Array(pts)),
    cutPathColors: state.cutPathColors,
    rapidPaths: new Float32Array(state.rapidData),
    rapidColors: state.rapidColors,
    bounds: state.bounds ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    lineCount,
    segments: state.segments,
    fileSizeBytes: gcode.length,
    totalCutDistance: state.totalCutDistance,
    totalRapidDistance: state.totalRapidDistance,
    feedrate,
  };
}
