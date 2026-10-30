import { describe, expect, it } from "vitest";
import {
  generateRasterLinesPath,
  rasterLinesDefaults,
} from "../../src/renderer/src/features/bitmap-renderers/rasterLines";
import type { BitmapRendererSettings, RendererContext, RendererSource } from "../../src/types";

const ctx = (source: RendererSource, settings: BitmapRendererSettings, scale = 1): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("generateRasterLinesPath", () => {
  it("uses practical defaults for a legible initial render", () => {
    expect(rasterLinesDefaults).toMatchObject({ waveform: "triangle", angleDeg: 0, originXPct: 50, originYPct: 50 });
  });

  it("returns no path for an empty image", () => {
    const path = generateRasterLinesPath(
      ctx({ width: 0, height: 0, values: new Uint8Array() }, rasterLinesDefaults),
    );
    expect(path).toBe("");
  });

  it("produces a bounded, plot-ready set of rows", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateRasterLinesPath(ctx(source, rasterLinesDefaults, 25.4 / 96));
    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path.length).toBeLessThan(200_000);
    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  it("draws a different pattern for horizontal vs diagonal angles", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const horizontal = generateRasterLinesPath(ctx(source, rasterLinesDefaults));
    const diagonal = generateRasterLinesPath(ctx(source, { ...rasterLinesDefaults, angleDeg: 45 }));
    expect(diagonal).not.toBe(horizontal);
  });

  it("uses tone modulation only where the source is dark", () => {
    const white = generateRasterLinesPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(255) }, rasterLinesDefaults),
    );
    const black = generateRasterLinesPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(0) }, rasterLinesDefaults),
    );
    expect(black).not.toBe(white);
  });
});
