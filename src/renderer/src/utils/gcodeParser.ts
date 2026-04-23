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
//   G2, G3        — arcs (interpolated to polyline segments for preview)
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
  /** Feed-move sub-paths (pen down).  Each Float32Array is one continuous
   *  stroke: [x0,y0, x1,y1, x2,y2, ...].  A new array begins wherever the
   *  pen lifted between cuts (i.e. a G0 rapid or initial pen-up gap). */
  cutPaths: Float32Array[];
  /** Rapid-move segments (pen up), packed as flat quads:
   *  [x_from, y_from, x_to, y_to,  x_from, y_from, x_to, y_to, ...].
   *  Stride = 4 (one segment per group of four values). */
  rapidPaths: Float32Array;
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

  // Cut sub-paths: each number[] becomes one Float32Array in cutPaths.
  // currentCutPath is the active (open) sub-path being built.
  const cutSubPaths: number[][] = [];
  let currentCutPath: number[] | null = null;

  // Rapid segments: flat [x_from, y_from, x_to, y_to, ...] buffer.
  const rapidData: number[] = [];

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

  const addCutSegment = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    lineNum: number,
  ) => {
    const segDist = Math.hypot(x1 - x0, y1 - y0);
    totalCutDistance += segDist;
    updateBounds(x1, y1);
    segments.push({
      from: { x: x0, y: y0 },
      to: { x: x1, y: y1 },
      type: "cut",
      lineNum,
    });
    if (!lastWasCut || currentCutPath === null) {
      currentCutPath = [x0, y0];
      cutSubPaths.push(currentCutPath);
    }
    currentCutPath.push(x1, y1);
    lastWasCut = true;
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
    const iw = getW("I");
    const jw = getW("J");

    // Skip lines with no X/Y motion
    if (xw === undefined && yw === undefined) continue;

    const scale = inMillimeters ? 1 : 25.4;
    // Update feedrate if an F word is present (convert in/min → mm/min when G20)
    if (fw !== undefined) feedrate = fw * scale;
    const nx =
      xw !== undefined ? (isAbsolute ? xw * scale : x + xw * scale) : x;
    const ny =
      yw !== undefined ? (isAbsolute ? yw * scale : y + yw * scale) : y;

    if (motionMode === 0) {
      updateBounds(nx, ny);
      const segDist = Math.hypot(nx - x, ny - y);
      segments.push({
        from: { x, y },
        to: { x: nx, y: ny },
        type: "rapid",
        lineNum: lineCount,
      });
      // Rapid — record as a flat quad [x_from, y_from, x_to, y_to]
      totalRapidDistance += segDist;
      rapidData.push(x, y, nx, ny);
      // A rapid lifts the pen, so the next cut must start a new sub-path.
      currentCutPath = null;
      lastWasCut = false;
    } else if (motionMode === 2 || motionMode === 3) {
      // Arc feed move (G2/G3), flattened into short line segments.
      const sx = x;
      const sy = y;

      const hasCenter = iw !== undefined || jw !== undefined;
      if (!hasCenter) {
        // No center data; fall back to a single linear segment.
        addCutSegment(sx, sy, nx, ny, lineCount);
      } else {
        const cx = sx + (iw ?? 0) * scale;
        const cy = sy + (jw ?? 0) * scale;
        const rs = Math.hypot(sx - cx, sy - cy);
        const re = Math.hypot(nx - cx, ny - cy);
        const r = (rs + re) * 0.5;

        if (!Number.isFinite(r) || r <= 1e-9) {
          addCutSegment(sx, sy, nx, ny, lineCount);
        } else {
          let a0 = Math.atan2(sy - cy, sx - cx);
          let a1 = Math.atan2(ny - cy, nx - cx);
          let delta = a1 - a0;
          if (motionMode === 2) {
            while (delta >= 0) delta -= Math.PI * 2;
          } else {
            while (delta <= 0) delta += Math.PI * 2;
          }

          // Full circle when endpoint equals startpoint.
          if (Math.hypot(nx - sx, ny - sy) <= 1e-6) {
            delta = motionMode === 2 ? -Math.PI * 2 : Math.PI * 2;
          }

          const arcSteps = Math.max(
            1,
            Math.ceil(Math.abs(delta) / (Math.PI / 18)),
          );
          let px = sx;
          let py = sy;
          for (let step = 1; step <= arcSteps; step++) {
            const t = step / arcSteps;
            const a = a0 + delta * t;
            const tx = step === arcSteps ? nx : cx + Math.cos(a) * r;
            const ty = step === arcSteps ? ny : cy + Math.sin(a) * r;
            addCutSegment(px, py, tx, ty, lineCount);
            px = tx;
            py = ty;
          }
        }
      }
    } else {
      // Linear feed move (G1)
      addCutSegment(x, y, nx, ny, lineCount);
    }

    x = nx;
    y = ny;
  }

  return {
    cutPaths: cutSubPaths.map((pts) => new Float32Array(pts)),
    rapidPaths: new Float32Array(rapidData),
    bounds: { minX, maxX, minY, maxY },
    lineCount,
    segments,
    fileSizeBytes: gcode.length,
    totalCutDistance,
    totalRapidDistance,
    feedrate,
  };
}
