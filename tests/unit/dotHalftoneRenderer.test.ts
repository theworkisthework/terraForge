import { describe, expect, it } from "vitest";
import {
  dotHalftoneDefaults,
  dotHalftoneRenderer,
  generateHalftoneDots,
} from "../../src/renderer/src/features/bitmap-renderers/dotHalftone";
import type { BitmapRendererSettings, RendererContext, RendererResult, RendererSource } from "../../src/types";

/** Every dot's outline joined into one path, for assertions about the shapes. */
const generateDotHalftonePath = (context: RendererContext) =>
  generateHalftoneDots(context).map((dot) => dot.d).join(" ");

const ctx = (source: RendererSource, settings: BitmapRendererSettings, scale = 1): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("dotHalftoneRenderer", () => {
  it("returns its output as dots, each tapped at its own centre", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(0) };
    const result = dotHalftoneRenderer.render(ctx(source, dotHalftoneDefaults)) as RendererResult;

    const [layer] = result.layers;
    expect(layer.d).toBeUndefined();
    expect(layer.dots!.length).toBeGreaterThan(0);
    for (const dot of layer.dots!) {
      const numbers = (dot.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const xs = numbers.filter((_, i) => i % 2 === 0);
      const ys = numbers.filter((_, i) => i % 2 === 1);
      // Edge dots are clipped, so only whole dots have the centre mid-outline.
      if (Math.min(...xs, ...ys) <= 0 || Math.max(...xs, ...ys) >= 40) continue;
      // Inside the dot's own bounding box, at its middle.
      expect(dot.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 1);
      expect(dot.y).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 1);
    }
  });

  it("uses practical defaults for a legible initial render", () => {
    expect(dotHalftoneDefaults).toMatchObject({ dotScale: 1, angleDeg: 0, originXPct: 50, originYPct: 50 });
  });
});

describe("generateHalftoneDots", () => {
  describe("at the image edge", () => {
    const source = { width: 40, height: 30, values: new Uint8Array(1200).fill(0) };
    const outline = (d: string) => {
      const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      return { xs: numbers.filter((_, i) => i % 2 === 0), ys: numbers.filter((_, i) => i % 2 === 1) };
    };

    it("keeps every dot inside the image, even at the largest dot scale", () => {
      const dots = generateHalftoneDots(ctx(source, { ...dotHalftoneDefaults, spacingMM: 5, dotScale: 3, angleDeg: 17 }));
      expect(dots.length).toBeGreaterThan(0);
      for (const dot of dots) {
        const { xs, ys } = outline(dot.d);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).toBeLessThanOrEqual(40);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...ys)).toBeLessThanOrEqual(30);
        expect(dot.d).toMatch(/Z$/);
      }
    });

    it("clips a dot at the edge rather than dropping it, and taps it inside the image", () => {
      const dots = generateHalftoneDots(ctx(source, { ...dotHalftoneDefaults, spacingMM: 5, dotScale: 3 }));
      const clipped = dots.filter((dot) => outline(dot.d).xs.some((x) => x === 0 || x === 40));
      expect(clipped.length).toBeGreaterThan(0);
      for (const dot of dots) {
        expect(dot.x).toBeGreaterThanOrEqual(0);
        expect(dot.x).toBeLessThanOrEqual(40);
        expect(dot.y).toBeGreaterThanOrEqual(0);
        expect(dot.y).toBeLessThanOrEqual(30);
      }
    });
  });

  it("returns no path for an empty image", () => {
    const path = generateDotHalftonePath(
      ctx({ width: 0, height: 0, values: new Uint8Array() }, dotHalftoneDefaults),
    );
    expect(path).toBe("");
  });

  it("produces a bounded set of closed, M...Z-only dots", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateDotHalftonePath(ctx(source, dotHalftoneDefaults, 25.4 / 96));
    expect(path).toMatch(/^M/);
    expect(path).toMatch(/Z( |$)/);
    expect(path.length).toBeLessThan(200_000);
    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
    expect(/[^MLZ0-9eE+\-.,\s]/.test(path)).toBe(false);
  });

  it("draws no dots at all for a uniformly white source", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(255) };
    const path = generateDotHalftonePath(ctx(source, dotHalftoneDefaults));
    expect(path).toBe("");
  });

  it("skips a cell whose dot would round to invisible, but draws one for a dark cell", () => {
    // toneDark = 1 - 250/255 ≈ 0.02, under the 5% skip threshold; 30 is well over it.
    const veryLight = { width: 40, height: 40, values: new Uint8Array(1600).fill(250) };
    const dark = { width: 40, height: 40, values: new Uint8Array(1600).fill(30) };
    const lightPath = generateDotHalftonePath(ctx(veryLight, dotHalftoneDefaults));
    const darkPath = generateDotHalftonePath(ctx(dark, dotHalftoneDefaults));
    expect(lightPath).toBe("");
    expect(darkPath.match(/M/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it("sizes each dot so its ink area, not its radius, tracks tone", () => {
    // spacingMM 3 at 1mm/px with dotScale 1: a full-black dot has radius 1.5px.
    const maxRadius = 1.5;
    for (const luminance of [64, 128, 192]) {
      const tone = 1 - luminance / 255;
      const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(luminance) };
      const dots = generateDotHalftonePath(ctx(source, { ...dotHalftoneDefaults, spacingMM: 3 }))
        .split(" Z")
        .filter((dot) => dot.trim())
        .map((dot) => {
          const numbers = (dot.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
          const xs = numbers.filter((_, i) => i % 2 === 0);
          const ys = numbers.filter((_, i) => i % 2 === 1);
          const cx = xs.reduce((a, b) => a + b) / xs.length;
          const cy = ys.reduce((a, b) => a + b) / ys.length;
          return { cx, cy, radius: Math.hypot(xs[0] - cx, ys[0] - cy) };
        });
      // An interior dot: one on the border samples the white beyond the image.
      const centre = dots.reduce((best, dot) =>
        Math.hypot(dot.cx - 20, dot.cy - 20) < Math.hypot(best.cx - 20, best.cy - 20) ? dot : best,
      );

      expect((centre.radius / maxRadius) ** 2).toBeCloseTo(tone, 1);
    }
  });

  it("changes the grid pattern when the screen angle changes", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const straight = generateDotHalftonePath(ctx(source, dotHalftoneDefaults));
    const rotated = generateDotHalftonePath(ctx(source, { ...dotHalftoneDefaults, angleDeg: 30 }));
    expect(rotated).not.toBe(straight);
  });

  it("changes the grid pattern when the origin moves", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const centred = generateDotHalftonePath(ctx(source, dotHalftoneDefaults));
    const offset = generateDotHalftonePath(
      ctx(source, { ...dotHalftoneDefaults, originXPct: 33, originYPct: 71 }),
    );
    expect(offset).not.toBe(centred);
  });

  it("scales dot size with dotScale", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const small = generateDotHalftonePath(ctx(source, { ...dotHalftoneDefaults, dotScale: 0.5 }));
    const large = generateDotHalftonePath(ctx(source, { ...dotHalftoneDefaults, dotScale: 1.5 }));
    expect(small).not.toBe(large);
  });

  it("offsets alternate rows for hex/triangular packing, not a plain square grid", () => {
    const source = { width: 60, height: 60, values: new Uint8Array(3600).fill(64) };
    const path = generateDotHalftonePath(ctx(source, dotHalftoneDefaults, 25.4 / 96));

    // Each dot's centre is the mean of its own vertices — the same
    // centroid technique `materializeBitmapLayers` uses to find a dot's
    // pointTap — grouped into rows by rounded y (angleDeg is 0, so rows
    // are axis-aligned).
    const subpaths = path.split(/(?=M)/).map((s) => s.trim()).filter(Boolean);
    const rows = new Map<number, number[]>();
    for (const subpath of subpaths) {
      const nums = (subpath.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        sumX += nums[i];
        sumY += nums[i + 1];
        count++;
      }
      const rowKey = Math.round((sumY / count) * 10);
      const columnX = Math.round((sumX / count) * 10);
      if (!rows.has(rowKey)) rows.set(rowKey, []);
      rows.get(rowKey)!.push(columnX);
    }

    const rowColumnSets = [...rows.values()];
    expect(rowColumnSets.length).toBeGreaterThan(1);
    // A plain square grid would repeat the same x positions on every row; a
    // hex-offset grid's adjacent rows share none of them.
    const [firstRow, secondRow] = rowColumnSets;
    const overlap = firstRow.filter((x) => secondRow.includes(x));
    expect(overlap).toHaveLength(0);
  });
});
