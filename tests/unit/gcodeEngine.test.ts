import { describe, it, expect } from "vitest";
import {
  tokenizePath,
  toAbsolute,
  transformPt,
  cubicBezier,
  quadBezier,
  arcToBeziers,
  nearestNeighbourSort,
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
    const cfg = createMachineConfig({ origin: "bottom-left", bedWidth: 200, bedHeight: 200 });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(10);
    expect(pt.y).toBeCloseTo(80); // 0 + 100*1 - 20
  });

  it("top-left origin — Y is identity", () => {
    const cfg = createMachineConfig({ origin: "top-left", bedWidth: 200, bedHeight: 200 });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(10);
    expect(pt.y).toBeCloseTo(20);
  });

  it("bottom-right origin — mirrors X and flips Y", () => {
    const cfg = createMachineConfig({ origin: "bottom-right", bedWidth: 200, bedHeight: 200 });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(190); // 200 - 10
    expect(pt.y).toBeCloseTo(80);
  });

  it("top-right origin — mirrors X only", () => {
    const cfg = createMachineConfig({ origin: "top-right", bedWidth: 200, bedHeight: 200 });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(190);
    expect(pt.y).toBeCloseTo(20);
  });

  it("center origin — shifts to center", () => {
    const cfg = createMachineConfig({ origin: "center", bedWidth: 200, bedHeight: 200 });
    const pt = transformPt(baseObj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(-90); // 10 - 100
    expect(pt.y).toBeCloseTo(80);  // 100 - 20
  });

  it("applies scale factor", () => {
    const obj = createVectorObject({ x: 0, y: 0, scale: 2, rotation: 0, originalWidth: 100, originalHeight: 100 });
    const cfg = createMachineConfig({ origin: "top-left", bedWidth: 400, bedHeight: 400 });
    const pt = transformPt(obj, cfg, 10, 20);
    expect(pt.x).toBeCloseTo(20);
    expect(pt.y).toBeCloseTo(40);
  });

  it("applies 90° rotation", () => {
    const obj = createVectorObject({ x: 0, y: 0, scale: 1, rotation: 90, originalWidth: 100, originalHeight: 100 });
    const cfg = createMachineConfig({ origin: "top-left", bedWidth: 400, bedHeight: 400 });
    const pt = transformPt(obj, cfg, 10, 0);
    // 90° rotation: x' = x*cos90 - y*sin90 = 0, y' = x*sin90 + y*cos90 = 10
    expect(pt.x).toBeCloseTo(0);
    expect(pt.y).toBeCloseTo(10);
  });

  it("applies position offset", () => {
    const obj = createVectorObject({ x: 50, y: 30, scale: 1, rotation: 0, originalWidth: 100, originalHeight: 100 });
    const cfg = createMachineConfig({ origin: "top-left", bedWidth: 400, bedHeight: 400 });
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
    const sp = [{ x: 10, y: 10 }, { x: 20, y: 20 }];
    const result = nearestNeighbourSort([sp]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(sp);
  });

  it("picks the nearest subpath first (from origin 0,0)", () => {
    const far: Pt[] = [{ x: 100, y: 100 }, { x: 110, y: 110 }];
    const near: Pt[] = [{ x: 1, y: 1 }, { x: 5, y: 5 }];
    const result = nearestNeighbourSort([far, near]);
    expect(result[0]).toBe(near);
    expect(result[1]).toBe(far);
  });

  it("chains closest-end to next-start correctly", () => {
    const a: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const b: Pt[] = [{ x: 11, y: 0 }, { x: 20, y: 0 }]; // close to end of a
    const c: Pt[] = [{ x: 50, y: 50 }, { x: 60, y: 60 }]; // far
    const result = nearestNeighbourSort([c, a, b]);
    expect(result[0]).toBe(a); // nearest to origin
    expect(result[1]).toBe(b); // nearest to end of a
    expect(result[2]).toBe(c);
  });
});

// ── flattenToSubpaths ─────────────────────────────────────────────────────────

describe("flattenToSubpaths", () => {
  const cfg = createMachineConfig({ origin: "top-left", bedWidth: 400, bedHeight: 400 });

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
});

// ── fmtCoord ──────────────────────────────────────────────────────────────────

describe("fmtCoord", () => {
  it("formats to 3 decimal places", () => {
    expect(fmtCoord(1.23456)).toBe("1.235");
    expect(fmtCoord(0)).toBe("0.000");
    expect(fmtCoord(-3.1)).toBe("-3.100");
  });
});
