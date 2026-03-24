import { describe, it, expect } from "vitest";
import {
  parseGcode,
  type GcodeToolpath,
} from "../../src/renderer/src/utils/gcodeParser";

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Convenience: parse and return the result for assertions. */
const parse = (gcode: string): GcodeToolpath => parseGcode(gcode);

const TOL = 0.001; // matches original .toFixed(3) precision
const approx = (a: number, b: number) => Math.abs(a - b) <= TOL;

function cutsEmpty(r: GcodeToolpath): boolean {
  return r.cutPaths.length === 0 || r.cutPaths.every((p) => p.length === 0);
}
function rapidsEmpty(r: GcodeToolpath): boolean {
  return r.rapidPaths.length === 0;
}
/** Returns true if any cut sub-path contains a point close to (x, y). */
function cutsContainPoint(r: GcodeToolpath, x: number, y: number): boolean {
  return r.cutPaths.some((path) => {
    for (let i = 0; i < path.length; i += 2) {
      if (approx(path[i], x) && approx(path[i + 1], y)) return true;
    }
    return false;
  });
}
/** Returns true if any rapid segment has a from- or to-point close to (x, y). */
function rapidsContainPoint(r: GcodeToolpath, x: number, y: number): boolean {
  const rp = r.rapidPaths;
  for (let i = 0; i < rp.length; i += 2) {
    if (approx(rp[i], x) && approx(rp[i + 1], y)) return true;
  }
  return false;
}
/** Number of distinct cut sub-paths (pen-down strokes). */
function cutSubpathCount(r: GcodeToolpath): number {
  return r.cutPaths.length;
}
/** Number of rapid (pen-up) segments. */
function rapidSegmentCount(r: GcodeToolpath): number {
  return r.rapidPaths.length / 4;
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("parseGcode", () => {
  // â”€â”€ Empty / trivial input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("returns empty paths for an empty string", () => {
    const r = parse("");
    expect(cutsEmpty(r)).toBe(true);
    expect(rapidsEmpty(r)).toBe(true);
    // split("") produces [""] â†’ parser counts 1 line
    expect(r.lineCount).toBe(1);
  });

  it("returns empty paths for pure comment lines", () => {
    const r = parse("; this is a comment\n(another comment)\n");
    expect(cutsEmpty(r)).toBe(true);
    expect(rapidsEmpty(r)).toBe(true);
    // trailing \n produces an extra empty element from split
    expect(r.lineCount).toBe(3);
  });

  // â”€â”€ Rapid moves (G0) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("parses a single G0 rapid move", () => {
    const r = parse("G0 X10 Y20\n");
    expect(rapidsContainPoint(r, 0, 0)).toBe(true);
    expect(rapidsContainPoint(r, 10, 20)).toBe(true);
    expect(cutsEmpty(r)).toBe(true);
  });

  it("generates separate segments for multiple rapids", () => {
    const r = parse("G0 X10 Y10\nG0 X20 Y20\n");
    expect(rapidSegmentCount(r)).toBe(2);
  });

  // â”€â”€ Feed moves (G1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("parses a single G1 linear feed move", () => {
    const r = parse("G1 X5 Y5\n");
    expect(cutsContainPoint(r, 0, 0)).toBe(true);
    expect(cutsContainPoint(r, 5, 5)).toBe(true);
    expect(rapidsEmpty(r)).toBe(true);
  });

  it("continues the same cut sub-path for consecutive G1 moves", () => {
    const r = parse("G1 X5 Y5\nG1 X10 Y10\n");
    expect(cutSubpathCount(r)).toBe(1); // one continuous cut sub-path
  });

  it("starts a new cut sub-path after a rapid intervenes", () => {
    const r = parse("G1 X5 Y5\nG0 X20 Y20\nG1 X25 Y25\n");
    expect(cutSubpathCount(r)).toBe(2); // two separate cut sub-paths
  });

  // â”€â”€ Arc commands (G2/G3) â€” approximated as lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("treats G2 clockwise arc as a feed move", () => {
    const r = parse("G1 X5 Y0\nG2 X10 Y5 I5 J0\n");
    // G2 treated as feed â€” should be in cuts, not rapids
    expect(cutsContainPoint(r, 10, 5)).toBe(true);
    expect(rapidsEmpty(r)).toBe(true);
  });

  it("treats G3 counter-clockwise arc as a feed move", () => {
    const r = parse("G1 X5 Y0\nG3 X10 Y5 I5 J0\n");
    expect(cutsContainPoint(r, 10, 5)).toBe(true);
  });

  // â”€â”€ Modal state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("keeps modal motion mode across lines (G1 sticky)", () => {
    const r = parse("G1\nX5 Y5\nX10 Y10\n");
    // After G1, subsequent X/Y coords should produce cuts
    expect(cutsContainPoint(r, 10, 10)).toBe(true);
  });

  // â”€â”€ Units: G20 (inch) & G21 (mm) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("defaults to millimetres (G21)", () => {
    const r = parse("G1 X1 Y1\n");
    expect(cutsContainPoint(r, 1, 1)).toBe(true);
  });

  it("scales inch coordinates by 25.4 when G20 is active", () => {
    const r = parse("G20\nG1 X1 Y1\n");
    expect(cutsContainPoint(r, 25.4, 25.4)).toBe(true);
  });

  it("switches back to mm with G21 after G20", () => {
    const r = parse("G20\nG1 X1 Y1\nG21\nG1 X50 Y50\n");
    expect(cutsContainPoint(r, 25.4, 25.4)).toBe(true);
    expect(cutsContainPoint(r, 50, 50)).toBe(true);
  });

  // â”€â”€ Positioning: G90 (absolute) & G91 (relative) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("defaults to absolute positioning (G90)", () => {
    const r = parse("G1 X10 Y10\nG1 X20 Y20\n");
    expect(cutsContainPoint(r, 20, 20)).toBe(true);
  });

  it("handles relative positioning G91", () => {
    const r = parse("G91\nG1 X10 Y10\nG1 X5 Y5\n");
    // First move: 0+10=10, 0+10=10
    // Second move: 10+5=15, 10+5=15
    expect(cutsContainPoint(r, 15, 15)).toBe(true);
  });

  // â”€â”€ Comments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("strips semicolon comments", () => {
    const r = parse("G1 X10 Y10 ; move to start\n");
    expect(cutsContainPoint(r, 10, 10)).toBe(true);
  });

  it("strips parenthesis comments", () => {
    const r = parse("G1 X10 (inline) Y10\n");
    expect(cutsContainPoint(r, 10, 10)).toBe(true);
  });

  // â”€â”€ Bounds tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("tracks bounding box correctly", () => {
    const r = parse("G0 X10 Y20\nG1 X30 Y5\n");
    // bounds track actual move coordinates, not origin
    expect(r.bounds).toEqual({
      minX: 10,
      maxX: 30,
      minY: 5,
      maxY: 20,
    });
  });

  it("returns zero bounds for gcode with no XY moves", () => {
    const r = parse("G21\nG90\n");
    expect(r.bounds).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });

  // â”€â”€ Line count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("counts all lines including blank ones", () => {
    // trailing \n splits into 4 elements: ["G0 X0 Y0","","G1 X10 Y10",""]
    const r = parse("G0 X0 Y0\n\nG1 X10 Y10\n");
    expect(r.lineCount).toBe(4);
  });

  // â”€â”€ Partial coordinates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("inherits previous coordinate when only X or Y is specified", () => {
    const r = parse("G1 X10 Y20\nG1 X30\n");
    // Second line: X=30, Y inherits 20
    expect(cutsContainPoint(r, 30, 20)).toBe(true);
  });

  // â”€â”€ Mode switch mid-file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("handles mixed absolute/relative mode switch mid-file", () => {
    const r = parse("G90\nG1 X10 Y10\nG91\nG1 X5 Y5\nG90\nG1 X50 Y50\n");
    // G90: X10 Y10 â†’ absolute (10,10)
    // G91: X5 Y5  â†’ relative from (10,10) â†’ (15,15)
    // G90: X50 Y50 â†’ absolute (50,50)
    expect(cutsContainPoint(r, 10, 10)).toBe(true);
    expect(cutsContainPoint(r, 15, 15)).toBe(true);
    expect(cutsContainPoint(r, 50, 50)).toBe(true);
  });

  // â”€â”€ Line number prefix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("ignores N-word line number prefix", () => {
    const r = parse("N100 G1 X10 Y20\nN200 G0 X30 Y40\n");
    expect(cutsContainPoint(r, 10, 20)).toBe(true);
    expect(rapidsContainPoint(r, 30, 40)).toBe(true);
  });

  // â”€â”€ Block delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("strips block-delete prefix '/' and still parses the line", () => {
    const r = parse("/ G1 X5 Y5\n");
    expect(cutsContainPoint(r, 5, 5)).toBe(true);
  });

  // â”€â”€ Large file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("handles a large file with 1000+ lines", () => {
    const lines: string[] = ["G1"];
    for (let i = 0; i < 1001; i++) {
      lines.push(`X${i} Y${i}`);
    }
    const r = parse(lines.join("\n"));
    expect(r.lineCount).toBeGreaterThanOrEqual(1002);
    expect(cutsContainPoint(r, 1000, 1000)).toBe(true);
  });

  // â”€â”€ fileSizeBytes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("reports fileSizeBytes equal to gcode string length", () => {
    const gcode = "G1 X10 Y10\n";
    const r = parse(gcode);
    expect(r.fileSizeBytes).toBe(gcode.length);
  });

  it("reports fileSizeBytes of 0 for empty input", () => {
    const r = parse("");
    expect(r.fileSizeBytes).toBe(0);
  });

  // â”€â”€ totalCutDistance / totalRapidDistance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("accumulates totalCutDistance for G1 moves", () => {
    // 3-4-5 right triangle: move from (0,0) to (3,4) â†’ distance = 5
    const r = parse("G1 X3 Y4\n");
    expect(r.totalCutDistance).toBeCloseTo(5, 3);
    expect(r.totalRapidDistance).toBe(0);
  });

  it("accumulates totalRapidDistance for G0 moves", () => {
    const r = parse("G0 X3 Y4\n");
    expect(r.totalRapidDistance).toBeCloseTo(5, 3);
    expect(r.totalCutDistance).toBe(0);
  });

  it("accumulates distances across multiple moves", () => {
    // G0 from (0,0) to (10,0) = 10 mm rapid
    // G1 from (10,0) to (10,10) = 10 mm cut
    const r = parse("G0 X10 Y0\nG1 X10 Y10\n");
    expect(r.totalRapidDistance).toBeCloseTo(10, 3);
    expect(r.totalCutDistance).toBeCloseTo(10, 3);
  });

  it("converts inch distances to mm for totalCutDistance", () => {
    // G20: 1 inch = 25.4 mm
    const r = parse("G20\nG1 X1 Y0\n");
    expect(r.totalCutDistance).toBeCloseTo(25.4, 3);
  });

  // â”€â”€ feedrate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("returns feedrate 0 when no F word is present", () => {
    const r = parse("G1 X10 Y10\n");
    expect(r.feedrate).toBe(0);
  });

  it("captures feedrate from F word in mm/min", () => {
    const r = parse("G1 F3000 X10 Y10\n");
    expect(r.feedrate).toBe(3000);
  });

  it("converts inch feedrate to mm/min when G20 active", () => {
    // 100 in/min = 2540 mm/min
    const r = parse("G20\nG1 F100 X1 Y0\n");
    expect(r.feedrate).toBeCloseTo(2540, 1);
  });

  it("captures the last seen feedrate value", () => {
    const r = parse("G1 F1000 X5 Y5\nG1 F2000 X10 Y10\n");
    expect(r.feedrate).toBe(2000);
  });

  // ── Targeted branch coverage ──────────────────────────────────────────────

  it("updates minX when a later move goes to a smaller X (line 94)", () => {
    // First point sets minX=30; second point has X=10 < minX → minX=10
    const r = parse("G1 X30 Y5\nG1 X10 Y20\n");
    expect(r.bounds.minX).toBeCloseTo(10);
  });

  it("skips a line that has content but no G-code word pairs (line 121)", () => {
    // '%' is a valid G-code program delimiter but contains no letter+number pairs
    const r = parse("G1 X10 Y10\n%\nG1 X20 Y20\n");
    expect(cutsContainPoint(r, 20, 20)).toBe(true);
  });

  it("restores absolute mode with explicit G90 after G91 (line 133)", () => {
    // G91 → relative. G90 → back to absolute. Final G1 X5 Y5 must be (5,5), not (15,15).
    const r = parse("G91\nG1 X10 Y10\nG90\nG1 X5 Y5\n");
    expect(cutsContainPoint(r, 5, 5)).toBe(true);
  });

  it("inherits current X when move specifies only Y (line 149 false branch)", () => {
    // 'G1 Y20' has no X word → nx falls back to current x (10)
    const r = parse("G1 X10 Y10\nG1 Y20\n");
    expect(cutsContainPoint(r, 10, 20)).toBe(true);
  });

  it("unrecognised modal G-code falls through the else-if chain without error", () => {
    // G17 (plane select) is not in the modal list — hits the implicit else of the chain
    const r = parse("G17\nG1 X10 Y10\n");
    expect(cutsContainPoint(r, 10, 10)).toBe(true);
  });
});
