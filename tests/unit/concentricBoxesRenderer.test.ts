import { describe, expect, it } from "vitest";
import {
  concentricBoxesDefaults,
  generateConcentricBoxesPath,
} from "../../src/renderer/src/features/bitmap-renderers/concentricBoxes";
import type { BitmapRendererSettings, RendererContext, RendererSource } from "../../src/types";

const ctx = (source: RendererSource, settings: BitmapRendererSettings, scale = 1): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("generateConcentricBoxesPath", () => {
  it("uses practical defaults for a legible initial render", () => {
    expect(concentricBoxesDefaults).toMatchObject({ waveform: "triangle", angleDeg: 0, originXPct: 50, originYPct: 50 });
  });

  it("returns no path for an empty image", () => {
    const path = generateConcentricBoxesPath(
      ctx({ width: 0, height: 0, values: new Uint8Array() }, concentricBoxesDefaults),
    );
    expect(path).toBe("");
  });

  it("produces a bounded, plot-ready set of closed boxes", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateConcentricBoxesPath(ctx(source, concentricBoxesDefaults, 25.4 / 96));
    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path.length).toBeLessThan(200_000);
    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  it("draws more than one box for an image larger than the box spacing", () => {
    const source = { width: 200, height: 200, values: new Uint8Array(40_000).fill(64) };
    const path = generateConcentricBoxesPath(ctx(source, concentricBoxesDefaults, 25.4 / 96));
    expect(path.match(/M/g)?.length ?? 0).toBeGreaterThan(1);
  });

  it("uses tone modulation only where the source is dark", () => {
    const white = generateConcentricBoxesPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(255) }, concentricBoxesDefaults),
    );
    const black = generateConcentricBoxesPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(0) }, concentricBoxesDefaults),
    );
    expect(black).not.toBe(white);
  });

  it("rotates the boxes when the angle setting changes", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const unrotated = generateConcentricBoxesPath(ctx(source, concentricBoxesDefaults));
    const rotated = generateConcentricBoxesPath(ctx(source, { ...concentricBoxesDefaults, angleDeg: 30 }));
    expect(rotated).not.toBe(unrotated);
  });
});

/** Each subpath's points, from a path drawn with no amplitude. */
const subpaths = (d: string) =>
  d.split(/(?=M)/).map((sub) => {
    const n = (sub.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    return n.filter((_, i) => i % 2 === 0).map((x, i) => ({ x, y: n[2 * i + 1] }));
  });

describe("box spacing", () => {
  it("is the same horizontally and vertically, even on a tall image", () => {
    // Portrait, 3x taller than wide; 1px = 1mm; white so nothing is displaced.
    const source = { width: 100, height: 300, values: new Uint8Array(30_000).fill(255) };
    const d = generateConcentricBoxesPath(ctx(source, { ...concentricBoxesDefaults, spacingMM: 10, amplitudeMM: 0 }));
    // Boxes small enough to lie wholly inside the image, innermost first.
    const boxes = subpaths(d)
      .map((points) => ({
        halfWidth: (Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))) / 2,
        halfHeight: (Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y))) / 2,
      }))
      .filter((box) => box.halfWidth < 49)
      .sort((a, b) => a.halfWidth - b.halfWidth);

    expect(boxes.length).toBeGreaterThan(2);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].halfWidth - boxes[i - 1].halfWidth).toBeCloseTo(10, 1);
      expect(boxes[i].halfHeight - boxes[i - 1].halfHeight).toBeCloseTo(10, 1);
    }
  });

  it("still reaches every corner of the image when rotated", () => {
    const source = { width: 120, height: 80, values: new Uint8Array(9_600).fill(255) };
    const d = generateConcentricBoxesPath(ctx(source, { ...concentricBoxesDefaults, spacingMM: 7, amplitudeMM: 0, angleDeg: 30 }));
    const points = subpaths(d).flat();
    for (const corner of [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 80 }, { x: 120, y: 80 }]) {
      const nearest = Math.min(...points.map((p) => Math.hypot(p.x - corner.x, p.y - corner.y)));
      expect(nearest, `corner ${corner.x},${corner.y}`).toBeLessThan(7);
    }
  });
});
