import { describe, it, expect } from "vitest";
import {
  tokenizePath,
  toAbsolute,
  transformPt,
  cubicBezier,
  quadBezier,
  arcToBeziers,
  nearestNeighbourSort,
  joinSubpaths,
  flattenToSubpaths,
  fmtCoord,
  type Pt,
} from "../../src/workers/gcodeEngine";
import { createVectorObject, createMachineConfig } from "../helpers/factories";

// ── tokenizePath ──────────────────────────────────────────────────────────────

describe("tokenizePath", () => {
  it("parses a simple M…L path", () => {
    const tokens = tokenizePath("M 0 0 L 10 20");
    expect(tokens).toEqual([
      { type: "M", args: [0, 0] },
      { type: "L", args: [10, 20] },
    ]);
  });

  it("returns empty for an empty string", () => {
    expect(tokenizePath("")).toEqual([]);
  });

  it("handles lowercase (relative) commands", () => {
    const tokens = tokenizePath("m 5 5 l 10 10");
    expect(tokens[0].type).toBe("m");
    expect(tokens[1].type).toBe("l");
  });

  it("handles comma-separated coordinates", () => {
    const tokens = tokenizePath("M0,0 L10,20");
    expect(tokens[1].args).toEqual([10, 20]);
  });

  it("handles negative numbers", () => {
    const tokens = tokenizePath("M -5 -10 L 5 10");
    expect(tokens[0].args).toEqual([-5, -10]);
  });

  it("parses Z command with no args", () => {
    const tokens = tokenizePath("M 0 0 L 10 10 Z");
    expect(tokens[2]).toEqual({ type: "Z", args: [] });
  });

  it("parses cubic bezier (C) command", () => {
    const tokens = tokenizePath("C 10 20 30 40 50 60");
    expect(tokens[0].args).toHaveLength(6);
  });

  it("parses arc (A) command", () => {
    const tokens = tokenizePath("A 25 25 0 0 1 50 25");
    expect(tokens[0].args).toHaveLength(7);
  });
});

// ── toAbsolute ────────────────────────────────────────────────────────────────

describe("toAbsolute", () => {
  it("passes through already-absolute M/L commands unchanged", () => {
    const tokens = [
      { type: "M", args: [10, 20] },
      { type: "L", args: [30, 40] },
    ];
    const abs = toAbsolute(tokens);
    expect(abs[0]).toEqual({ type: "M", args: [10, 20] });
    expect(abs[1]).toEqual({ type: "L", args: [30, 40] });
  });

  it("converts relative m to absolute M", () => {
    const abs = toAbsolute([{ type: "m", args: [10, 20] }]);
    expect(abs[0]).toEqual({ type: "M", args: [10, 20] });
  });

  it("converts relative l to absolute L with accumulated position", () => {
    const abs = toAbsolute([
      { type: "M", args: [10, 10] },
      { type: "l", args: [5, 5] },
    ]);
    expect(abs[1]).toEqual({ type: "L", args: [15, 15] });
  });

  it("converts relative h to absolute H", () => {
    const abs = toAbsolute([
      { type: "M", args: [10, 10] },
      { type: "h", args: [5] },
    ]);
    expect(abs[1]).toEqual({ type: "H", args: [15] });
  });

  it("converts relative v to absolute V", () => {
    const abs = toAbsolute([
      { type: "M", args: [10, 10] },
      { type: "v", args: [7] },
    ]);
    expect(abs[1]).toEqual({ type: "V", args: [17] });
  });

  it("resets position on Z", () => {
    const abs = toAbsolute([
      { type: "M", args: [10, 10] },
      { type: "L", args: [20, 20] },
      { type: "Z", args: [] },
      { type: "l", args: [5, 5] },
    ]);
    // After Z, position returns to startX=10, startY=10
    // relative l 5,5 → absolute L 15,15
    expect(abs[3]).toEqual({ type: "L", args: [15, 15] });
  });

  it("handles poly-point M (implicit lineto)", () => {
    const abs = toAbsolute([{ type: "M", args: [0, 0, 10, 10, 20, 20] }]);
    expect(abs[0].args).toEqual([0, 0, 10, 10, 20, 20]);
  });

  it("converts relative cubic c to absolute C", () => {
    const abs = toAbsolute([
      { type: "M", args: [10, 10] },
      { type: "c", args: [1, 2, 3, 4, 5, 6] },
    ]);
    expect(abs[1]).toEqual({ type: "C", args: [11, 12, 13, 14, 15, 16] });
  });

  it("converts relative arc a to absolute A", () => {
    const abs = toAbsolute([
      { type: "M", args: [10, 10] },
      { type: "a", args: [25, 25, 0, 0, 1, 50, 0] },
    ]);
    // rx,ry,xRot,largeArc,sweep stay the same; endpoint is relative
    expect(abs[1].type).toBe("A");
    expect(abs[1].args[5]).toBe(60); // 10 + 50
    expect(abs[1].args[6]).toBe(10); // 10 + 0
  });
});

// ── transformPt ───────────────────────────────────────────────────────────────

describe("transformPt", () => {
  const baseObj = createVectorObject({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    originalWidth: 100,
    originalHeight: 100,
  });

  it("bottom-left origin — flips Y", () => {
    const cfg = createMachineConfig({
      origin: "bottom-left",
      bedWidth: 200,
      bedHeight: 200,
    });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(10);
    expect(pt.y).toBeCloseTo(80); // 0 + 100*1 - 20
  });

  it("top-left origin — Y is identity", () => {
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 200,
      bedHeight: 200,
    });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(10);
    expect(pt.y).toBeCloseTo(20);
  });

  it("bottom-right origin — mirrors X and flips Y", () => {
    const cfg = createMachineConfig({
      origin: "bottom-right",
      bedWidth: 200,
      bedHeight: 200,
    });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(190); // 200 - 10
    expect(pt.y).toBeCloseTo(80);
  });

  it("top-right origin — mirrors X only", () => {
    const cfg = createMachineConfig({
      origin: "top-right",
      bedWidth: 200,
      bedHeight: 200,
    });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(190);
    expect(pt.y).toBeCloseTo(20);
  });

  it("center origin — shifts to center", () => {
    const cfg = createMachineConfig({
      origin: "center",
      bedWidth: 200,
      bedHeight: 200,
    });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(-90); // 10 - 100
    expect(pt.y).toBeCloseTo(80); // 100 - 20
  });

  it("applies scale factor", () => {
    const obj = createVectorObject({
      x: 0,
      y: 0,
      scale: 2,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 400,
      bedHeight: 400,
    });
    const pt = transformPt(obj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(20);
    expect(pt.y).toBeCloseTo(40);
  });

  it("applies 90° rotation (around object centre)", () => {
    // 100×100 object at origin; centre = (50, 50) in SVG user units.
    // SVG point (10, 0): offset from centre = (-40, -50).
    // 90° CW rotation: x\'= -(-50)=50,  y\'= -40.
    // Machine (top-left): x = 50+50 = 100,  y = 0+50+(-40) = 10.
    const obj = createVectorObject({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 90,
      originalWidth: 100,
      originalHeight: 100,
    });
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 400,
      bedHeight: 400,
    });
    const pt = transformPt(obj, cfg, 10, 0);
    expect(pt.x).toBeCloseTo(100);
    expect(pt.y).toBeCloseTo(10);
  });

  it("applies position offset", () => {
    const obj = createVectorObject({
      x: 50,
      y: 30,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 400,
      bedHeight: 400,
    });
    const pt = transformPt(obj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(60);
    expect(pt.y).toBeCloseTo(50);
  });
});

// ── cubicBezier ───────────────────────────────────────────────────────────────

describe("cubicBezier", () => {
  it("always ends at the endpoint", () => {
    const pts = cubicBezier(0, 0, 10, 20, 30, 40, 50, 60);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(50);
    expect(last.y).toBeCloseTo(60);
  });

  it("returns at least the endpoint for a flat curve", () => {
    // Collinear control points — should be nearly flat
    const pts = cubicBezier(0, 0, 1, 1, 2, 2, 3, 3);
    expect(pts.length).toBeGreaterThanOrEqual(1);
    expect(pts[pts.length - 1]).toEqual({ x: 3, y: 3 });
  });

  it("generates intermediate points for a non-flat curve", () => {
    const pts = cubicBezier(0, 0, 0, 100, 100, 100, 100, 0);
    expect(pts.length).toBeGreaterThan(2); // should subdivide
  });
});

// ── quadBezier ────────────────────────────────────────────────────────────────

describe("quadBezier", () => {
  it("always ends at the endpoint", () => {
    const pts = quadBezier(0, 0, 50, 100, 100, 0);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(100);
    expect(last.y).toBeCloseTo(0);
  });
});

// ── arcToBeziers ──────────────────────────────────────────────────────────────

describe("arcToBeziers", () => {
  it("returns empty for coincident start/end points", () => {
    expect(arcToBeziers(10, 10, 5, 5, 0, 0, 1, 10, 10)).toEqual([]);
  });

  it("returns the endpoint for zero radii (degenerate arc)", () => {
    const pts = arcToBeziers(0, 0, 0, 0, 0, 0, 1, 10, 10);
    expect(pts).toEqual([{ x: 10, y: 10 }]);
  });

  it("generates points approximating a semicircle", () => {
    // Half-circle: from (0,0) to (100,0) with rx=ry=50
    const pts = arcToBeziers(0, 0, 50, 50, 0, 0, 1, 100, 0);
    expect(pts.length).toBeGreaterThan(2);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(100, 0);
    expect(last.y).toBeCloseTo(0, 0);
  });
});

// ── nearestNeighbourSort ──────────────────────────────────────────────────────

describe("nearestNeighbourSort", () => {
  it("returns empty for empty input", () => {
    expect(nearestNeighbourSort([])).toEqual([]);
  });

  it("returns a single subpath unchanged", () => {
    const sp = [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ];
    const result = nearestNeighbourSort([sp]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(sp);
  });

  it("picks the nearest subpath first (from origin 0,0)", () => {
    const far: Pt[] = [
      { x: 100, y: 100 },
      { x: 110, y: 110 },
    ];
    const near: Pt[] = [
      { x: 1, y: 1 },
      { x: 5, y: 5 },
    ];
    const result = nearestNeighbourSort([far, near]);
    expect(result[0]).toBe(near);
    expect(result[1]).toBe(far);
  });

  it("chains closest-end to next-start correctly", () => {
    const a: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b: Pt[] = [
      { x: 11, y: 0 },
      { x: 20, y: 0 },
    ]; // close to end of a
    const c: Pt[] = [
      { x: 50, y: 50 },
      { x: 60, y: 60 },
    ]; // far
    const result = nearestNeighbourSort([c, a, b]);
    expect(result[0]).toBe(a); // nearest to origin
    expect(result[1]).toBe(b); // nearest to end of a
    expect(result[2]).toBe(c);
  });
});

// ── flattenToSubpaths ─────────────────────────────────────────────────────────

describe("flattenToSubpaths", () => {
  const cfg = createMachineConfig({
    origin: "top-left",
    bedWidth: 400,
    bedHeight: 400,
  });

  it("converts a simple line path to one subpath with 2 points", () => {
    const obj = createVectorObject({
      path: "M 0 0 L 10 10",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    expect(sp[0]).toHaveLength(2);
  });

  it("splits at M commands into separate subpaths", () => {
    const obj = createVectorObject({
      path: "M 0 0 L 10 10 M 20 20 L 30 30",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(2);
  });

  it("handles Z (close path) by creating a closed subpath", () => {
    const obj = createVectorObject({
      path: "M 0 0 L 10 0 L 10 10 Z",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    const first = sp[0][0];
    const last = sp[0][sp[0].length - 1];
    expect(first.x).toBeCloseTo(last.x);
    expect(first.y).toBeCloseTo(last.y);
  });

  it("generates many points for a curve path", () => {
    const obj = createVectorObject({
      path: "M 0 0 C 0 100 100 100 100 0",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    expect(sp[0].length).toBeGreaterThan(2);
  });

  it("flattens a path with quadratic bezier (Q) to multiple points", () => {
    const obj = createVectorObject({
      path: "M 0 0 Q 50 100 100 0",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    expect(sp[0].length).toBeGreaterThan(2);
    // Endpoint should be approximately (100, 100) in top-left space
    const last = sp[0][sp[0].length - 1];
    expect(last.x).toBeCloseTo(100, 0);
  });

  it("flattens a path with arc (A) to multiple points", () => {
    const obj = createVectorObject({
      path: "M 0 0 A 50 50 0 0 1 100 0",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    expect(sp[0].length).toBeGreaterThan(2);
    const last = sp[0][sp[0].length - 1];
    expect(last.x).toBeCloseTo(100, 0);
  });

  it("applies H and V commands correctly", () => {
    const obj = createVectorObject({
      path: "M 0 0 H 50 V 50",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    expect(sp[0]).toHaveLength(3); // M, H, V
  });
});

// ── fmtCoord ──────────────────────────────────────────────────────────────────

describe("fmtCoord", () => {
  it("formats to 3 decimal places", () => {
    expect(fmtCoord(1.23456)).toBe("1.235");
    expect(fmtCoord(0)).toBe("0.000");
    expect(fmtCoord(-3.1)).toBe("-3.100");
  });
});

// ── toAbsolute — S and T relative variants ────────────────────────────────────

describe("toAbsolute (smooth commands)", () => {
  it("converts relative s to absolute S", () => {
    // M 0,0 then C puts current at (50,60) with last cp at (30,40)
    const abs = toAbsolute([
      { type: "M", args: [0, 0] },
      { type: "C", args: [10, 20, 30, 40, 50, 60] },
      { type: "s", args: [5, 5, 10, 10] }, // relative: cp2=(50+5,60+5), end=(50+10,60+10)
    ]);
    expect(abs[2].type).toBe("S");
    expect(abs[2].args).toEqual([55, 65, 60, 70]);
  });

  it("converts relative t to absolute T", () => {
    // M 0,0 then Q: current at (100,0)
    const abs = toAbsolute([
      { type: "M", args: [0, 0] },
      { type: "Q", args: [50, 100, 100, 0] },
      { type: "t", args: [20, 0] }, // relative: endpoint=(100+20, 0+0)
    ]);
    expect(abs[2].type).toBe("T");
    expect(abs[2].args).toEqual([120, 0]);
  });

  it("converts multiple relative s args in one token", () => {
    const abs = toAbsolute([
      { type: "M", args: [0, 0] },
      { type: "s", args: [10, 10, 20, 20, 5, 5, 30, 30] }, // two S segments
    ]);
    // First S: cp2=(10,10), end=(20,20); second S: cp2=(20+5,20+5)=(25,25), end=(20+30,20+30)=(50,50)
    expect(abs[1].type).toBe("S");
    expect(abs[1].args[0]).toBe(10);
    expect(abs[1].args[1]).toBe(10);
    expect(abs[1].args[2]).toBe(20);
    expect(abs[1].args[3]).toBe(20);
    expect(abs[1].args[4]).toBe(25);
    expect(abs[1].args[5]).toBe(25);
    expect(abs[1].args[6]).toBe(50);
    expect(abs[1].args[7]).toBe(50);
  });
});

// ── transformPt — rotation ────────────────────────────────────────────────────
//
// The canvas rotates each import around the CENTRE of its bounding box
// (originalWidth/2, originalHeight/2) in SVG user units.  transformPt must
// match that exactly.

describe("transformPt (rotation)", () => {
  it("rotates 90° CW around object centre (top-left origin)", () => {
    // 100×100 object at machine origin.  Centre = SVG (50, 50).
    // Test point SVG (10, 0): offset from centre = (-40, -50).
    // 90° CW: x' = -offset_y = 50,  y' = offset_x = -40.
    // Machine (top-left): x = 50 + 50 = 100,  y = 0 + 50 + (-40) = 10.
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 400,
      bedHeight: 400,
    });
    const obj = createVectorObject({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 90,
      originalWidth: 100,
      originalHeight: 100,
    });
    const pt = transformPt(obj, cfg, 10, 0);
    expect(pt.x).toBeCloseTo(100, 1);
    expect(pt.y).toBeCloseTo(10, 1);
  });

  it("object centre is invariant under any rotation (top-left origin)", () => {
    // The SVG midpoint (W/2, H/2) must always map to the same machine
    // position regardless of rotation angle — it is the rotation pivot.
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 400,
      bedHeight: 400,
    });
    const obj = createVectorObject({
      x: 20,
      y: 30,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    // Centre must always land at (obj.x + halfW, obj.y + halfH) = (70, 80)
    const ptNoRot = transformPt(obj, cfg, 50, 50);
    expect(ptNoRot.x).toBeCloseTo(70);
    expect(ptNoRot.y).toBeCloseTo(80);

    for (const deg of [45, 90, 135, 180, 270]) {
      const rotated = transformPt({ ...obj, rotation: deg }, cfg, 50, 50);
      expect(rotated.x).toBeCloseTo(70, 1);
      expect(rotated.y).toBeCloseTo(80, 1);
    }
  });

  it("rotates 90° CW around object centre (bottom-left origin)", () => {
    // 100×100 object; obj.y=0 means bottom edge at machine Y=0.
    // Centre in machine mm = (obj.x + 50, obj.y + 50) = (50, 50).
    // SVG (10, 0): offset from centre = (-40, -50).
    // 90° CW: x' = 50, y' = -40.
    // bottom-left Y-flip: machine Y = centre_Y - y' = 50 - (-40) = 90.
    const cfg = createMachineConfig({
      origin: "bottom-left",
      bedWidth: 400,
      bedHeight: 400,
    });
    const obj = createVectorObject({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 90,
      originalWidth: 100,
      originalHeight: 100,
    });
    const pt = transformPt(obj, cfg, 10, 0);
    expect(pt.x).toBeCloseTo(100, 1);
    expect(pt.y).toBeCloseTo(90, 1);
  });

  it("object centre invariant under rotation (bottom-left origin)", () => {
    const cfg = createMachineConfig({
      origin: "bottom-left",
      bedWidth: 400,
      bedHeight: 400,
    });
    const obj = createVectorObject({
      x: 20,
      y: 30,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
    });
    // Centre machine-space: (20+50, 30+50) = (70, 80)
    for (const deg of [0, 45, 90, 180, 270]) {
      const pt = transformPt({ ...obj, rotation: deg }, cfg, 50, 50);
      expect(pt.x).toBeCloseTo(70, 1);
      expect(pt.y).toBeCloseTo(80, 1);
    }
  });
});

// ── flattenToSubpaths — S and T smooth commands ───────────────────────────────

describe("flattenToSubpaths (S and T smooth curves)", () => {
  const cfg = createMachineConfig({
    origin: "top-left",
    bedWidth: 400,
    bedHeight: 400,
  });

  it("flattens S (smooth cubic) to multiple points", () => {
    // C sets lastCpX/Y to the second control point; S reflects it
    const obj = createVectorObject({
      path: "M 0 0 C 10 20 30 40 50 60 S 70 80 90 100",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 200,
      originalHeight: 200,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    // Should have more than 2 points (bezier subdivided)
    expect(sp[0].length).toBeGreaterThan(2);
    // Endpoint should be near (90,100) in top-left space
    const last = sp[0][sp[0].length - 1];
    expect(last.x).toBeCloseTo(90, 0);
    expect(last.y).toBeCloseTo(100, 0);
  });

  it("S command after M (no preceding C) uses current point as both control points", () => {
    // Without a preceding C/S, the reflection degenerates to the current point
    const obj = createVectorObject({
      path: "M 0 0 S 50 50 100 0",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 200,
      originalHeight: 200,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    const last = sp[0][sp[0].length - 1];
    expect(last.x).toBeCloseTo(100, 0);
    expect(last.y).toBeCloseTo(0, 0);
  });

  it("flattens T (smooth quadratic) to multiple points", () => {
    // Q sets lastCpX/Y; T reflects it
    const obj = createVectorObject({
      path: "M 0 0 Q 25 50 50 0 T 100 0",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 200,
      originalHeight: 200,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    expect(sp[0].length).toBeGreaterThan(2);
    const last = sp[0][sp[0].length - 1];
    expect(last.x).toBeCloseTo(100, 0);
    expect(last.y).toBeCloseTo(0, 0);
  });

  it("T command after M (no preceding Q) uses current point as control point", () => {
    const obj = createVectorObject({
      path: "M 0 0 T 50 50",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 200,
      originalHeight: 200,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    const last = sp[0][sp[0].length - 1];
    expect(last.x).toBeCloseTo(50, 0);
    expect(last.y).toBeCloseTo(50, 0);
  });

  it("chained T commands each reflect the previous control point", () => {
    const obj = createVectorObject({
      path: "M 0 0 Q 25 50 50 0 T 100 0 T 150 0",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 300,
      originalHeight: 200,
    });
    const sp = flattenToSubpaths(obj, cfg);
    expect(sp).toHaveLength(1);
    const last = sp[0][sp[0].length - 1];
    expect(last.x).toBeCloseTo(150, 0);
    expect(last.y).toBeCloseTo(0, 0);
  });
});

// ── joinSubpaths ────────────────────────────────────────────────────────────────

describe("joinSubpaths", () => {
  it("returns empty array for empty input", () => {
    expect(joinSubpaths([], 0.5)).toEqual([]);
  });

  it("returns a single subpath unchanged", () => {
    const sp = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const result = joinSubpaths([sp], 0.5);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sp);
  });

  it("does not join subpaths further apart than tolerance", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b = [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]; // gap = 10, tol = 0.5
    const result = joinSubpaths([a, b], 0.5);
    expect(result).toHaveLength(2);
  });

  it("joins two subpaths whose end→start gap is within tolerance", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b = [
      { x: 10.1, y: 0 },
      { x: 20, y: 0 },
    ]; // gap = 0.1 < tol 0.2
    const result = joinSubpaths([a, b], 0.2);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(4); // both subpaths merged
    expect(result[0][0]).toEqual({ x: 0, y: 0 });
    expect(result[0][result[0].length - 1]).toEqual({ x: 20, y: 0 });
  });

  it("joins exactly at the tolerance boundary", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b = [
      { x: 10.2, y: 0 },
      { x: 20, y: 0 },
    ]; // gap = 0.2, tol = 0.2
    const result = joinSubpaths([a, b], 0.2);
    expect(result).toHaveLength(1);
  });

  it("does not join when gap slightly exceeds tolerance", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b = [
      { x: 10.21, y: 0 },
      { x: 20, y: 0 },
    ]; // gap > 0.2
    const result = joinSubpaths([a, b], 0.2);
    expect(result).toHaveLength(2);
  });

  it("chains multiple consecutive joins into a single subpath", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b = [
      { x: 10.1, y: 0 },
      { x: 20, y: 0 },
    ];
    const c = [
      { x: 20.05, y: 0 },
      { x: 30, y: 0 },
    ];
    const result = joinSubpaths([a, b, c], 0.2);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(6);
    expect(result[0][result[0].length - 1]).toEqual({ x: 30, y: 0 });
  });

  it("handles a mix of joinable and non-joinable pairs", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b = [
      { x: 10.1, y: 0 },
      { x: 20, y: 0 },
    ]; // joined with a
    const c = [
      { x: 100, y: 0 },
      { x: 110, y: 0 },
    ]; // far from b, new group
    const d = [
      { x: 110.05, y: 0 },
      { x: 120, y: 0 },
    ]; // joined with c
    const result = joinSubpaths([a, b, c, d], 0.2);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(4); // a+b
    expect(result[1]).toHaveLength(4); // c+d
  });

  it("uses Euclidean distance (diagonal gap)", () => {
    // Diagonal gap of sqrt(0.02^2 + 0.02^2) ≈ 0.028 < tol 0.05
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const b = [
      { x: 10.02, y: 10.02 },
      { x: 20, y: 20 },
    ];
    const result = joinSubpaths([a, b], 0.05);
    expect(result).toHaveLength(1);
  });
});
