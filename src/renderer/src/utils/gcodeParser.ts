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

export function parseGcode(gcode: string): GcodeToolpath {
  let x = 0,
    y = 0;
  let isAbsolute = true;
  let inMillimeters = true;
  let motionMode = 0; // 0=G0, 1=G1, 2=G2, 3=G3
  let activeColor: string | null = null;
  let activeLayer: string | null = null;
  let activeDip: string | null = null;

  // Cut sub-paths: each number[] becomes one Float32Array in cutPaths.
  // currentCutPath is the active (open) sub-path being built.
  const cutSubPaths: number[][] = [];
  const cutPathColors: Array<string | null> = [];
  let currentCutPath: number[] | null = null;

  // Rapid segments: flat [x_from, y_from, x_to, y_to, ...] buffer.
  const rapidData: number[] = [];
  const rapidColors: Array<string | null> = [];

  const segments: GcodeSegment[] = [];

  let minX = 0,
    maxX = 0,
    minY = 0,
    maxY = 0;
  let boundsInit = false;
  let lineCount = 0;
  let lastWasCut = false;
  let feedrate = 0;
  let totalCutDistance = 0;
  let totalRapidDistance = 0;

  const updateBounds = (nx: number, ny: number) => {
    if (!boundsInit) {
      minX = maxX = nx;
      minY = maxY = ny;
      boundsInit = true;
    } else {
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
    }
  };

  for (const rawLine of gcode.split("\n")) {
    lineCount++;

    const blockDeleteStripped = rawLine.replace(/^\//, "");
    const noParen = blockDeleteStripped.replace(/\([^)]*\)/g, "");
    const commentStart = noParen.indexOf(";");
    if (commentStart >= 0) {
      const commentText = noParen.slice(commentStart + 1);
      const marker = parseTfMarker(commentText);
      if (marker) {
        if (marker.color !== undefined) activeColor = marker.color;
        if (marker.layer !== undefined) activeLayer = marker.layer;
        if (marker.dip !== undefined) activeDip = marker.dip;
      }
    }

    // Strip block-delete prefix, parenthesis comments, and semicolon comments
    const line = noParen
      .replace(/;.*$/, "")
      .trim()
      .toUpperCase();

    if (!line) continue;

    // Parse letter+number word pairs
    const words: [string, number][] = [];
    const rx = /([A-Z])([-+]?\d*\.?\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(line)) !== null) {
      words.push([m[1], parseFloat(m[2])]);
    }
    if (!words.length) continue;

    // Update modal state from G-codes on this line
    for (const [l, v] of words) {
      if (l !== "G") continue;
      const g = Math.round(v * 10) / 10; // handle G0, G1, G20.1 etc
      if (g === 0) motionMode = 0;
      else if (g === 1) motionMode = 1;
      else if (g === 2) motionMode = 2;
      else if (g === 3) motionMode = 3;
      else if (g === 20) inMillimeters = false;
      else if (g === 21) inMillimeters = true;
      else if (g === 90) isAbsolute = true;
      else if (g === 91) isAbsolute = false;
    }

    const getW = (l: string) => words.find(([wl]) => wl === l)?.[1];
    const xw = getW("X");
    const yw = getW("Y");
    const fw = getW("F");

    // Skip lines with no X/Y motion
    if (xw === undefined && yw === undefined) continue;

    const scale = inMillimeters ? 1 : 25.4;
    // Update feedrate if an F word is present (convert in/min → mm/min when G20)
    if (fw !== undefined) feedrate = fw * scale;
    const nx =
      xw !== undefined ? (isAbsolute ? xw * scale : x + xw * scale) : x;
    const ny =
      yw !== undefined ? (isAbsolute ? yw * scale : y + yw * scale) : y;

    updateBounds(nx, ny);

    const segDist = Math.sqrt((nx - x) ** 2 + (ny - y) ** 2);

    // Record the segment for live plot-progress tracking
    segments.push({
      from: { x, y },
      to: { x: nx, y: ny },
      type: motionMode === 0 ? "rapid" : "cut",
      color: activeColor ?? undefined,
      layer: activeLayer ?? undefined,
      dip: activeDip ?? undefined,
      lineNum: lineCount,
    });

    if (motionMode === 0) {
      // Rapid — record as a flat quad [x_from, y_from, x_to, y_to]
      totalRapidDistance += segDist;
      rapidData.push(x, y, nx, ny);
      rapidColors.push(activeColor);
      // A rapid lifts the pen, so the next cut must start a new sub-path.
      currentCutPath = null;
      lastWasCut = false;
    } else {
      // Feed (G1) or arc (G2/G3 approximated as straight line)
      totalCutDistance += segDist;
      if (!lastWasCut || currentCutPath === null) {
        // Start a new cut sub-path beginning at the current position.
        currentCutPath = [x, y];
        cutSubPaths.push(currentCutPath);
        cutPathColors.push(activeColor);
      }
      currentCutPath.push(nx, ny);
      lastWasCut = true;
    }

    x = nx;
    y = ny;
  }

  return {
    cutPaths: cutSubPaths.map((pts) => new Float32Array(pts)),
    cutPathColors,
    rapidPaths: new Float32Array(rapidData),
    rapidColors,
    bounds: { minX, maxX, minY, maxY },
    lineCount,
    segments,
    fileSizeBytes: gcode.length,
    totalCutDistance,
    totalRapidDistance,
    feedrate,
  };
}
