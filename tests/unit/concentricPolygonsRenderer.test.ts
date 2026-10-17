import { describe, expect, it } from "vitest";
import {
  concentricPolygonsDefaults,
  generateConcentricPolygonsPath,
} from "../../src/renderer/src/features/bitmap-renderers/concentricPolygons";
import type { BitmapRendererSettings, RendererContext, RendererSource } from "../../src/types";

const ctx = (source: RendererSource, settings: BitmapRendererSettings, scale = 1): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("generateConcentricPolygonsPath", () => {
  it("uses practical defaults for a legible initial render", () => {
    expect(concentricPolygonsDefaults).toMatchObject({ sides: 6, waveform: "triangle", angleDeg: 0, originXPct: 50, originYPct: 50 });
  });

  it("returns no path for an empty image", () => {
    const path = generateConcentricPolygonsPath(
      ctx({ width: 0, height: 0, values: new Uint8Array() }, concentricPolygonsDefaults),
    );
    expect(path).toBe("");
  });

  it("produces a bounded, plot-ready set of closed polygons", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateConcentricPolygonsPath(ctx(source, concentricPolygonsDefaults, 25.4 / 96));
    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path.length).toBeLessThan(200_000);
    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  it("draws more than one polygon for an image larger than the ring spacing", () => {
    const source = { width: 200, height: 200, values: new Uint8Array(40_000).fill(64) };
    const path = generateConcentricPolygonsPath(ctx(source, concentricPolygonsDefaults, 25.4 / 96));
    expect(path.match(/M/g)?.length ?? 0).toBeGreaterThan(1);
  });

  it("uses tone modulation only where the source is dark", () => {
    const white = generateConcentricPolygonsPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(255) }, concentricPolygonsDefaults),
    );
    const black = generateConcentricPolygonsPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(0) }, concentricPolygonsDefaults),
    );
    expect(black).not.toBe(white);
  });

  it("never emits a coordinate outside a non-square image's bounds", () => {
    // Wider than tall: polygons sized to reach the farthest corner would
    // bleed past the top/bottom edges without the clip-to-rect safety net.
    const width = 80;
    const height = 40;
    const path = generateConcentricPolygonsPath(
      ctx({ width, height, values: new Uint8Array(width * height).fill(64) }, { ...concentricPolygonsDefaults, spacingMM: 4, toothWidthMM: 3, amplitudeMM: 3 }, 1),
    );
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(0);
      expect(numbers[i]).toBeLessThanOrEqual(width);
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
      expect(numbers[i + 1]).toBeLessThanOrEqual(height);
    }
  });

  it("changes shape when the side count changes", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const hexagon = generateConcentricPolygonsPath(ctx(source, concentricPolygonsDefaults));
    const triangle = generateConcentricPolygonsPath(ctx(source, { ...concentricPolygonsDefaults, sides: 3 }));
    expect(triangle).not.toBe(hexagon);
  });

  it("clamps an out-of-range side count instead of producing a degenerate polygon", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateConcentricPolygonsPath(ctx(source, { ...concentricPolygonsDefaults, sides: 1 }));
    expect(path).not.toContain("NaN");
    expect(path).toMatch(/^M/);
  });
});
