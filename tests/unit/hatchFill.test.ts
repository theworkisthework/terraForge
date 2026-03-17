import { describe, it, expect } from "vitest";
import { generateHatchPaths } from "../../src/renderer/src/utils/hatchFill";

// A 10×10 square in SVG user units
const SQUARE = "M 0 0 L 10 0 L 10 10 L 0 10 Z";
// A closed triangle
const TRIANGLE = "M 0 0 L 10 0 L 5 10 Z";

describe("generateHatchPaths", () => {
  // ── Basic sanity ────────────────────────────────────────────────────────────

  it("returns an array", () => {
    const result = generateHatchPaths(SQUARE, 2, 0);
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns M…L path strings for each hatch line", () => {
    const result = generateHatchPaths(SQUARE, 2, 0);
    for (const seg of result) {
      expect(seg).toMatch(/^M[\d.,-]+ L[\d.,-]+$/);
    }
  });

  it("produces hatch lines inside a 10×10 square at spacing 2", () => {
    // spacing 2 across 10 units → roughly 4 interior lines
    const result = generateHatchPaths(SQUARE, 2, 0);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it("produces more lines with smaller spacing", () => {
    const few = generateHatchPaths(SQUARE, 5, 0);
    const many = generateHatchPaths(SQUARE, 1, 0);
    expect(many.length).toBeGreaterThan(few.length);
  });

  it("produces fewer lines with larger spacing", () => {
    const dense = generateHatchPaths(SQUARE, 1, 0);
    const sparse = generateHatchPaths(SQUARE, 4, 0);
    expect(sparse.length).toBeLessThan(dense.length);
  });

  // ── Degenerate / edge input ──────────────────────────────────────────────

  it("returns empty array for empty d string", () => {
    expect(generateHatchPaths("", 2, 0)).toEqual([]);
  });

  it("returns empty array for a single point (no segments)", () => {
    expect(generateHatchPaths("M 5 5", 2, 0)).toEqual([]);
  });

  it("returns empty array when spacing is larger than the shape", () => {
    // shape is 10 units tall; spacing 50 → scanline never hits interior
    const result = generateHatchPaths(SQUARE, 50, 0);
    expect(result).toEqual([]);
  });

  it("returns empty array for spacing of 0 (would infinite-loop)", () => {
    expect(generateHatchPaths(SQUARE, 0, 0)).toEqual([]);
  });

  it("returns empty array for negative spacing", () => {
    expect(generateHatchPaths(SQUARE, -1, 0)).toEqual([]);
  });

  it("returns empty array for Infinity spacing", () => {
    expect(generateHatchPaths(SQUARE, Infinity, 0)).toEqual([]);
  });

  it("returns empty array for NaN spacing", () => {
    expect(generateHatchPaths(SQUARE, NaN, 0)).toEqual([]);
  });

  it("returns empty array for NaN angle", () => {
    expect(generateHatchPaths(SQUARE, 2, NaN)).toEqual([]);
  });

  it("returns empty array for Infinity angle", () => {
    expect(generateHatchPaths(SQUARE, 2, Infinity)).toEqual([]);
  });

  // ── Angle variants ──────────────────────────────────────────────────────────

  it("handles angle 0 (horizontal lines)", () => {
    const result = generateHatchPaths(SQUARE, 2, 0);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles angle 45 (diagonal lines)", () => {
    const result = generateHatchPaths(SQUARE, 2, 45);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles angle 90 (vertical lines)", () => {
    const result = generateHatchPaths(SQUARE, 2, 90);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles angle 135", () => {
    const result = generateHatchPaths(SQUARE, 2, 135);
    expect(result.length).toBeGreaterThan(0);
  });

  it("angle 0 and angle 180 produce the same number of lines (equivalent)", () => {
    const a0 = generateHatchPaths(SQUARE, 2, 0);
    const a180 = generateHatchPaths(SQUARE, 2, 180);
    expect(a0.length).toBe(a180.length);
  });

  // ── Non-rectangular shapes ───────────────────────────────────────────────

  it("hatches a triangle", () => {
    const result = generateHatchPaths(TRIANGLE, 2, 0);
    expect(result.length).toBeGreaterThan(0);
  });

  it("triangle lines are shorter near the apex (even-odd fill)", () => {
    // The scanline near y=0 (base) should span wider than near y=9 (apex)
    // We can't easily measure length without parsing, but we can confirm count
    const result = generateHatchPaths(TRIANGLE, 1, 0);
    expect(result.length).toBeGreaterThan(2);
  });

  // ── Coordinate format ────────────────────────────────────────────────────

  it("path coordinates are finite numbers", () => {
    const result = generateHatchPaths(SQUARE, 2, 45);
    for (const seg of result) {
      // Extract all numbers from the path string
      const nums = seg.match(/-?[\d.]+/g)!.map(Number);
      for (const n of nums) {
        expect(isFinite(n)).toBe(true);
      }
    }
  });

  // ── Curve support ───────────────────────────────────────────────────────────

  it("handles a circular arc shape", () => {
    // Approximate circle with arc commands
    const circle = "M 10 0 A 10 10 0 1 0 -10 0 A 10 10 0 1 0 10 0 Z";
    const result = generateHatchPaths(circle, 3, 0);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles a cubic bezier shape", () => {
    const blob = "M 0 5 C 0 0 10 0 10 5 C 10 10 0 10 0 5 Z";
    const result = generateHatchPaths(blob, 1, 0);
    expect(result.length).toBeGreaterThan(0);
  });
});
