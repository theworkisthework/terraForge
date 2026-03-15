// ── G-code toolpath parser ────────────────────────────────────────────────────
//
// Converts a G-code text file into two SVG path `d` strings:
//   cuts   — G1/G2/G3 feed moves (pen down / drawing)
//   rapids — G0 rapid moves (pen up / travel)
//
// Coordinates are output in millimetres in the G-code work coordinate space
// so they can be rendered directly on the bed canvas via a matching transform.
//
// Supported:
//   G0, G1        — linear rapid / feed
//   G2, G3        — arcs (approximated as straight lines for now)
//   G20 / G21     — inch / mm units
//   G90 / G91     — absolute / relative positioning
//   N<number>     — line numbers (parsed and counted)
//   ; ...  ( )    — comments stripped

/** A single linear motion segment extracted from G-code.
 *  Coordinates are in machine work-coordinate mm, matching the G-code values
 *  directly — the same space reported by FluidNC's WPos status field. */
export interface GcodeSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: "cut" | "rapid";
  /** 1-indexed sequential line number of the source G-code line that produced
   *  this segment.  Matches the line counter FluidNC reports in Ln:N,Total
   *  status messages, enabling reliable progress tracking without coordinate
   *  matching. */
  lineNum: number;
}

export interface GcodeToolpath {
  cuts: string; // SVG path d — feed moves
  rapids: string; // SVG path d — rapid moves
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

  const cutParts: string[] = [];
  const rapidParts: string[] = [];
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

    // Strip block-delete prefix, parenthesis comments, and semicolon comments
    const line = rawLine
      .replace(/^\//, "")
      .replace(/\([^)]*\)/g, "")
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
      lineNum: lineCount,
    });

    if (motionMode === 0) {
      // Rapid — always start a new sub-path segment
      totalRapidDistance += segDist;
      rapidParts.push(
        `M ${x.toFixed(3)} ${y.toFixed(3)} L ${nx.toFixed(3)} ${ny.toFixed(3)}`,
      );
      lastWasCut = false;
    } else {
      // Feed (G1) or arc (G2/G3 approximated as straight line)
      totalCutDistance += segDist;
      if (!lastWasCut) {
        cutParts.push(`M ${x.toFixed(3)} ${y.toFixed(3)}`);
      }
      cutParts.push(`L ${nx.toFixed(3)} ${ny.toFixed(3)}`);
      lastWasCut = true;
    }

    x = nx;
    y = ny;
  }

  return {
    cuts: cutParts.join(" "),
    rapids: rapidParts.join(" "),
    bounds: { minX, maxX, minY, maxY },
    lineCount,
    segments,
    fileSizeBytes: gcode.length,
    totalCutDistance,
    totalRapidDistance,
    feedrate,
  };
}
