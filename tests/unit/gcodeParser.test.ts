import { describe, it, expect } from "vitest";
import {
  parseGcode,
  type GcodeToolpath,
} from "../../src/renderer/src/utils/gcodeParser";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convenience: parse and return the result for assertions. */
const parse = (gcode: string): GcodeToolpath => parseGcode(gcode);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("parseGcode", () => {
  // ── Empty / trivial input ─────────────────────────────────────────────────

  it("returns empty paths for an empty string", () => {
    const r = parse("");
    expect(r.cuts).toBe("");
    expect(r.rapids).toBe("");
    // split("") produces [""] → parser counts 1 line
    expect(r.lineCount).toBe(1);
  });

  it("returns empty paths for pure comment lines", () => {
    const r = parse("; this is a comment\n(another comment)\n");
    expect(r.cuts).toBe("");
    expect(r.rapids).toBe("");
    // trailing \n produces an extra empty element from split
    expect(r.lineCount).toBe(3);
  });

  // ── Rapid moves (G0) ─────────────────────────────────────────────────────

  it("parses a single G0 rapid move", () => {
    const r = parse("G0 X10 Y20\n");
    expect(r.rapids).toContain("M 0.000 0.000");
    expect(r.rapids).toContain("L 10.000 20.000");
    expect(r.cuts).toBe("");
  });

  it("generates separate M-L segments for multiple rapids", () => {
    const r = parse("G0 X10 Y10\nG0 X20 Y20\n");
    // Each rapid starts a new M...L segment
    const mCount = (r.rapids.match(/M /g) || []).length;
    expect(mCount).toBe(2);
  });

  // ── Feed moves (G1) ──────────────────────────────────────────────────────

  it("parses a single G1 linear feed move", () => {
    const r = parse("G1 X5 Y5\n");
    expect(r.cuts).toContain("M 0.000 0.000");
    expect(r.cuts).toContain("L 5.000 5.000");
    expect(r.rapids).toBe("");
  });

  it("continues the same cut sub-path for consecutive G1 moves", () => {
    const r = parse("G1 X5 Y5\nG1 X10 Y10\n");
    const mCount = (r.cuts.match(/M /g) || []).length;
    expect(mCount).toBe(1); // one continuous cut sub-path
  });

  it("starts a new cut sub-path after a rapid intervenes", () => {
    const r = parse("G1 X5 Y5\nG0 X20 Y20\nG1 X25 Y25\n");
    const mCount = (r.cuts.match(/M /g) || []).length;
    expect(mCount).toBe(2); // two separate cut sub-paths
  });

  // ── Arc commands (G2/G3) — approximated as lines ──────────────────────────

  it("treats G2 clockwise arc as a feed move", () => {
    const r = parse("G1 X5 Y0\nG2 X10 Y5 I5 J0\n");
    // G2 treated as feed — should be in cuts, not rapids
    expect(r.cuts).toContain("L 10.000 5.000");
    expect(r.rapids).toBe("");
  });

  it("treats G3 counter-clockwise arc as a feed move", () => {
    const r = parse("G1 X5 Y0\nG3 X10 Y5 I5 J0\n");
    expect(r.cuts).toContain("L 10.000 5.000");
  });

  // ── Modal state ───────────────────────────────────────────────────────────

  it("keeps modal motion mode across lines (G1 sticky)", () => {
    const r = parse("G1\nX5 Y5\nX10 Y10\n");
    // After G1, subsequent X/Y coords should produce cuts
    expect(r.cuts).toContain("L 10.000 10.000");
  });

  // ── Units: G20 (inch) & G21 (mm) ─────────────────────────────────────────

  it("defaults to millimetres (G21)", () => {
    const r = parse("G1 X1 Y1\n");
    expect(r.cuts).toContain("L 1.000 1.000");
  });

  it("scales inch coordinates by 25.4 when G20 is active", () => {
    const r = parse("G20\nG1 X1 Y1\n");
    expect(r.cuts).toContain("L 25.400 25.400");
  });

  it("switches back to mm with G21 after G20", () => {
    const r = parse("G20\nG1 X1 Y1\nG21\nG1 X50 Y50\n");
    expect(r.cuts).toContain("L 25.400 25.400");
    expect(r.cuts).toContain("L 50.000 50.000");
  });

  // ── Positioning: G90 (absolute) & G91 (relative) ─────────────────────────

  it("defaults to absolute positioning (G90)", () => {
    const r = parse("G1 X10 Y10\nG1 X20 Y20\n");
    expect(r.cuts).toContain("L 20.000 20.000");
  });

  it("handles relative positioning G91", () => {
    const r = parse("G91\nG1 X10 Y10\nG1 X5 Y5\n");
    // First move: 0+10=10, 0+10=10
    // Second move: 10+5=15, 10+5=15
    expect(r.cuts).toContain("L 15.000 15.000");
  });

  // ── Comments ──────────────────────────────────────────────────────────────

  it("strips semicolon comments", () => {
    const r = parse("G1 X10 Y10 ; move to start\n");
    expect(r.cuts).toContain("L 10.000 10.000");
  });

  it("strips parenthesis comments", () => {
    const r = parse("G1 X10 (inline) Y10\n");
    expect(r.cuts).toContain("L 10.000 10.000");
  });

  // ── Bounds tracking ───────────────────────────────────────────────────────

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

  // ── Line count ────────────────────────────────────────────────────────────

  it("counts all lines including blank ones", () => {
    // trailing \n splits into 4 elements: ["G0 X0 Y0","","G1 X10 Y10",""]
    const r = parse("G0 X0 Y0\n\nG1 X10 Y10\n");
    expect(r.lineCount).toBe(4);
  });

  // ── Partial coordinates ───────────────────────────────────────────────────

  it("inherits previous coordinate when only X or Y is specified", () => {
    const r = parse("G1 X10 Y20\nG1 X30\n");
    // Second line: X=30, Y inherits 20
    expect(r.cuts).toContain("L 30.000 20.000");
  });

  // ── Mode switch mid-file ──────────────────────────────────────────────

  it("handles mixed absolute/relative mode switch mid-file", () => {
    const r = parse("G90\nG1 X10 Y10\nG91\nG1 X5 Y5\nG90\nG1 X50 Y50\n");
    // G90: X10 Y10 → absolute (10,10)
    // G91: X5 Y5  → relative from (10,10) → (15,15)
    // G90: X50 Y50 → absolute (50,50)
    expect(r.cuts).toContain("L 10.000 10.000");
    expect(r.cuts).toContain("L 15.000 15.000");
    expect(r.cuts).toContain("L 50.000 50.000");
  });

  // ── Line number prefix ────────────────────────────────────────────────

  it("ignores N-word line number prefix", () => {
    const r = parse("N100 G1 X10 Y20\nN200 G0 X30 Y40\n");
    expect(r.cuts).toContain("L 10.000 20.000");
    expect(r.rapids).toContain("L 30.000 40.000");
  });

  // ── Block delete ──────────────────────────────────────────────────────

  it("strips block-delete prefix '/' and still parses the line", () => {
    const r = parse("/ G1 X5 Y5\n");
    expect(r.cuts).toContain("L 5.000 5.000");
  });

  // ── Large file ────────────────────────────────────────────────────────

  it("handles a large file with 1000+ lines", () => {
    const lines: string[] = ["G1"];
    for (let i = 0; i < 1001; i++) {
      lines.push(`X${i} Y${i}`);
    }
    const r = parse(lines.join("\n"));
    expect(r.lineCount).toBeGreaterThanOrEqual(1002);
    expect(r.cuts).toContain("L 1000.000 1000.000");
  });
});
