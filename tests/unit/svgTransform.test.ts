import { describe, it, expect } from "vitest";
import {
  applyMatrixToPathD,
  computePathsBounds,
  getAccumulatedTransform,
} from "../../src/renderer/src/utils/svgTransform";

// ── applyMatrixToPathD ────────────────────────────────────────────────────────

describe("applyMatrixToPathD", () => {
  it("returns the input unchanged for identity matrix", () => {
    const d = "M 10 20 L 30 40";
    const identity = new DOMMatrix();
    expect(applyMatrixToPathD(d, identity)).toBe(d);
  });

  it("applies a translation", () => {
    const d = "M 0 0 L 10 10";
    const m = new DOMMatrix();
    m.e = 100; // translateX
    m.f = 200; // translateY
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("M 100,200");
    expect(result).toContain("L 110,210");
  });

  it("applies a uniform scale", () => {
    const d = "M 10 20 L 30 40";
    const m = new DOMMatrix([2, 0, 0, 2, 0, 0]);
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("M 20,40");
    expect(result).toContain("L 60,80");
  });

  it("transforms cubic bezier control points", () => {
    const d = "M 0 0 C 10 20 30 40 50 60";
    const m = new DOMMatrix([1, 0, 0, 1, 10, 10]); // translate(10,10)
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("C ");
    expect(result).toContain("60,70"); // endpoint 50+10, 60+10
  });

  it("expands H/V to L before transforming", () => {
    const d = "M 0 0 H 10 V 20";
    const m = new DOMMatrix([1, 0, 0, 1, 5, 5]);
    const result = applyMatrixToPathD(d, m);
    // H/V should now be L commands
    expect(result).not.toContain("H ");
    expect(result).not.toContain("V ");
    expect(result).toContain("L ");
  });

  it("handles empty path string", () => {
    const m = new DOMMatrix([2, 0, 0, 2, 0, 0]);
    expect(applyMatrixToPathD("", m)).toBe("");
  });

  it("preserves Z command", () => {
    const d = "M 0 0 L 10 0 L 10 10 Z";
    const m = new DOMMatrix([1, 0, 0, 1, 5, 5]);
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("Z");
  });

  it("handles arcs with transform", () => {
    const d = "M 0 0 A 25 25 0 0 1 50 0";
    const m = new DOMMatrix([2, 0, 0, 2, 0, 0]); // scale 2x
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("A ");
    // endpoint should be scaled
    expect(result).toContain(",100,0"); // 50*2=100
  });

  it("handles relative commands by converting to absolute first", () => {
    const d = "M 10 10 l 5 5";
    const identity = new DOMMatrix();
    // Force non-identity so the transform is applied
    identity.a = 1.0; // still identity but we need to test the conversion
    // With an actual identity, the fast path returns input unchanged.
    // Use a tiny transform to force processing:
    const m = new DOMMatrix([1, 0, 0, 1, 0.001, 0]);
    const result = applyMatrixToPathD(d, m);
    // Should contain absolute coordinate ~15
    expect(result).toMatch(/L 15/);
  });

  it("applies a non-uniform scale", () => {
    const d = "M 10 20 L 30 40";
    const m = new DOMMatrix([3, 0, 0, 1, 0, 0]);
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("M 30,20");
    expect(result).toContain("L 90,40");
  });

  it("applies a 90° rotation", () => {
    const d = "M 10 0 L 20 0";
    const m = new DOMMatrix([0, 1, -1, 0, 0, 0]);
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("M 0,10");
    expect(result).toContain("L 0,20");
  });

  it("applies an arbitrary matrix", () => {
    const d = "M 1 0 L 0 1";
    const m = new DOMMatrix([2, 1, 0.5, 3, 10, 20]);
    const result = applyMatrixToPathD(d, m);
    // (1,0) → (2*1+0.5*0+10, 1*1+3*0+20) = (12, 21)
    expect(result).toContain("M 12,21");
    // (0,1) → (2*0+0.5*1+10, 1*0+3*1+20) = (10.5, 23)
    expect(result).toContain("L 10.5,23");
  });

  it("transforms S (smooth cubic) commands", () => {
    const d = "M 0 0 C 10 20 30 40 50 60 S 70 80 90 100";
    const m = new DOMMatrix([1, 0, 0, 1, 5, 5]);
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("S ");
    expect(result).toContain("95,105");
  });

  it("transforms Q (quadratic bezier) commands", () => {
    const d = "M 0 0 Q 50 100 100 0";
    const m = new DOMMatrix([2, 0, 0, 2, 0, 0]);
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("Q ");
    expect(result).toContain("200,0");
  });

  it("transforms T (smooth quadratic) commands", () => {
    const d = "M 0 0 Q 25 50 50 0 T 100 0";
    const m = new DOMMatrix([1, 0, 0, 1, 10, 10]);
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("T ");
    expect(result).toContain("110,10");
  });

  it("handles multi-point M (implicit L after first pair)", () => {
    const d = "M 0 0 10 10 20 20";
    const m = new DOMMatrix([1, 0, 0, 1, 5, 5]);
    const result = applyMatrixToPathD(d, m);
    expect(result).toContain("M 5,5");
    expect(result).toContain("15,15");
    expect(result).toContain("25,25");
  });

  it("returns no coordinate commands for a path with only Z", () => {
    const d = "Z";
    const m = new DOMMatrix([2, 0, 0, 2, 0, 0]);
    const result = applyMatrixToPathD(d, m);
    expect(result).not.toMatch(/[ML]/);
  });
});

// ── computePathsBounds ────────────────────────────────────────────────────────

describe("computePathsBounds", () => {
  it("returns null for empty array", () => {
    expect(computePathsBounds([])).toBeNull();
  });

  it("returns null for array of empty strings", () => {
    expect(computePathsBounds(["", ""])).toBeNull();
  });

  it("computes bounds for a simple rectangle path", () => {
    const d = "M 10 20 L 30 20 L 30 50 L 10 50 Z";
    const bounds = computePathsBounds([d]);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBeCloseTo(10);
    expect(bounds!.minY).toBeCloseTo(20);
    expect(bounds!.maxX).toBeCloseTo(30);
    expect(bounds!.maxY).toBeCloseTo(50);
  });

  it("merges bounds across multiple paths", () => {
    const d1 = "M 0 0 L 10 10";
    const d2 = "M 50 50 L 100 100";
    const bounds = computePathsBounds([d1, d2]);
    expect(bounds!.minX).toBeCloseTo(0);
    expect(bounds!.minY).toBeCloseTo(0);
    expect(bounds!.maxX).toBeCloseTo(100);
    expect(bounds!.maxY).toBeCloseTo(100);
  });

  it("includes control points for cubic beziers (conservative bounds)", () => {
    // The control point at (0, 100) should extend the bounds
    const d = "M 0 0 C 0 100 100 100 100 0";
    const bounds = computePathsBounds([d]);
    expect(bounds!.maxY).toBeGreaterThanOrEqual(100);
  });

  it("handles H/V commands via expansion", () => {
    const d = "M 5 5 H 20 V 30";
    const bounds = computePathsBounds([d]);
    expect(bounds!.minX).toBeCloseTo(5);
    expect(bounds!.maxX).toBeCloseTo(20);
    expect(bounds!.minY).toBeCloseTo(5);
    expect(bounds!.maxY).toBeCloseTo(30);
  });

  it("handles relative commands", () => {
    const d = "M 10 10 l 20 30";
    const bounds = computePathsBounds([d]);
    expect(bounds!.minX).toBeCloseTo(10);
    expect(bounds!.maxX).toBeCloseTo(30);
    expect(bounds!.maxY).toBeCloseTo(40);
  });

  it("handles arc endpoints", () => {
    const d = "M 0 0 A 50 50 0 0 1 100 0";
    const bounds = computePathsBounds([d]);
    expect(bounds!.minX).toBeCloseTo(0);
    expect(bounds!.maxX).toBeCloseTo(100);
  });

  it("includes S (smooth cubic) control and endpoint coordinates", () => {
    // M to (0,0), C to (50,60) with last cp=(30,40), then S with cp2=(70,80) end=(90,100)
    const d = "M 0 0 C 10 20 30 40 50 60 S 70 80 90 100";
    const bounds = computePathsBounds([d]);
    expect(bounds).not.toBeNull();
    expect(bounds!.maxX).toBeGreaterThanOrEqual(70);
    expect(bounds!.maxY).toBeGreaterThanOrEqual(80);
  });

  it("includes Q (quadratic bezier) control and endpoint coordinates", () => {
    const d = "M 0 0 Q 50 100 100 0";
    const bounds = computePathsBounds([d]);
    expect(bounds).not.toBeNull();
    expect(bounds!.maxX).toBeGreaterThanOrEqual(50);
    expect(bounds!.maxY).toBeGreaterThanOrEqual(100);
  });

  it("includes T (smooth quadratic) endpoint coordinates", () => {
    // T only contributes its endpoint to bounds
    const d = "M 0 0 Q 25 50 50 0 T 100 0";
    const bounds = computePathsBounds([d]);
    expect(bounds).not.toBeNull();
    expect(bounds!.maxX).toBeGreaterThanOrEqual(100);
  });
});

// ── getAccumulatedTransform ───────────────────────────────────────────────────

describe("getAccumulatedTransform", () => {
  it("returns identity for an element with no transforms", () => {
    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><path id="p" d="M0 0 L10 10"/></svg>',
      "image/svg+xml",
    );
    const el = doc.getElementById("p")!;
    const m = getAccumulatedTransform(el);
    expect(m.isIdentity).toBe(true);
  });

  // Note: More detailed tests of getAccumulatedTransform require a full SVG DOM
  // with transform.baseVal support, which jsdom/DOMParser may not fully implement.
  // These are better covered in integration tests with a real SVG renderer.
});
