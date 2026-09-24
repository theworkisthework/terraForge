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
