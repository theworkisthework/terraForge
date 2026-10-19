import { describe, expect, it } from "vitest";
import {
  generateRadialBurstPath,
  radialBurstDefaults,
} from "../../src/renderer/src/features/bitmap-renderers/radialBurst";
import type { BitmapRendererSettings, RendererContext, RendererSource } from "../../src/types";

const ctx = (source: RendererSource, settings: BitmapRendererSettings, scale = 1): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("generateRadialBurstPath", () => {
  it("uses practical defaults for a legible initial render", () => {
    expect(radialBurstDefaults).toMatchObject({ spacingMM: 3, waveform: "triangle", angleDeg: 0, originXPct: 50, originYPct: 50 });
  });

  it("returns no path for an empty image", () => {
    const path = generateRadialBurstPath(
      ctx({ width: 0, height: 0, values: new Uint8Array() }, radialBurstDefaults),
    );
    expect(path).toBe("");
  });

  it("produces a bounded, plot-ready fan of rays", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateRadialBurstPath(ctx(source, radialBurstDefaults, 25.4 / 96));
    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path.length).toBeLessThan(200_000);
    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  describe("ray spacing", () => {
    // Straight rays (no amplitude) at 1px = 1mm, so geometry reads off exactly.
    const size = 400;
    const spacing = 3;
    const source = { width: size, height: size, values: new Uint8Array(size * size).fill(255) };
    const rays = () =>
      generateRadialBurstPath(ctx(source, { ...radialBurstDefaults, spacingMM: spacing, amplitudeMM: 0 }))
        .split(/(?=M)/)
        .map((subpath) => {
          const numbers = (subpath.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
          const [x0, y0] = numbers;
          const [x1, y1] = numbers.slice(-2);
          return {
            start: Math.hypot(x0 - size / 2, y0 - size / 2),
            end: Math.hypot(x1 - size / 2, y1 - size / 2),
          };
        });

    it("keeps the gap between rays close to the spacing at every radius, with no banding", () => {
      const all = rays();
      // Every radius from just outside the clear centre to the edge — banding
      // (rays all added at once at each doubling) shows up as the gap swinging
      // between one and two spacings as the radius grows.
      for (let radius = 10; radius < 200; radius += 3.7) {
        const count = all.filter((ray) => ray.start <= radius + 0.01 && ray.end >= radius).length;
        const gap = (2 * Math.PI * radius) / count;
        expect(gap, `gap at r=${radius.toFixed(1)}`).toBeGreaterThanOrEqual(spacing - 0.01);
        expect(gap, `gap at r=${radius.toFixed(1)}`).toBeLessThan(spacing * 1.25);
      }
    });

    it("adds rays evenly round the circle rather than in one sweep", () => {
      // Partway through a doubling, the rays added so far are spread over every
      // quarter of the circle, not bunched on one side.
      const added = generateRadialBurstPath(ctx(source, { ...radialBurstDefaults, spacingMM: spacing, amplitudeMM: 0 }))
        .split(/(?=M)/)
        .map((subpath) => (subpath.match(/-?\d+(\.\d+)?/g) ?? []).map(Number))
        .map(([x, y]) => ({ r: Math.hypot(x - size / 2, y - size / 2), angle: Math.atan2(y - size / 2, x - size / 2) }))
        .filter(({ r }) => r > 40 && r < 60);
      const quarters = new Set(added.map(({ angle }) => Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 4) % 4));
      expect(added.length).toBeGreaterThan(4);
      expect(quarters.size).toBe(4);
    });

    it("leaves a small clear centre instead of piling every ray into it", () => {
      const innermost = Math.min(...rays().map((ray) => ray.start));
      expect(innermost).toBeGreaterThan(spacing);
      expect(innermost).toBeLessThan(3 * spacing);
    });

    it("runs every ray out to the image edge", () => {
      // The centred origin is 200px from each edge, further to the corners.
      expect(rays().every((ray) => ray.end >= size / 2 - 0.01)).toBe(true);
    });
  });

  it("uses tone modulation only where the source is dark", () => {
    const white = generateRadialBurstPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(255) }, radialBurstDefaults),
    );
    const black = generateRadialBurstPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(0) }, radialBurstDefaults),
    );
    expect(black).not.toBe(white);
  });

  it("shifts the burst centre when the origin settings move", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const centred = generateRadialBurstPath(ctx(source, radialBurstDefaults));
    const offset = generateRadialBurstPath(
      ctx(source, { ...radialBurstDefaults, originXPct: 20, originYPct: 20 }),
    );
    expect(offset).not.toBe(centred);
  });
});
