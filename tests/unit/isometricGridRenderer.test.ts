import { describe, expect, it } from "vitest";
import {
  generateIsometricGridPath,
  isometricGridDefaults,
} from "../../src/renderer/src/features/bitmap-renderers/isometricGrid";
import { generateRasterLinesPath } from "../../src/renderer/src/features/bitmap-renderers/rasterLines";
import type { BitmapRendererSettings, RendererContext, RendererSource } from "../../src/types";

const ctx = (source: RendererSource, settings: BitmapRendererSettings, scale = 1): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("generateIsometricGridPath", () => {
  it("uses practical defaults for a legible initial render", () => {
    expect(isometricGridDefaults).toMatchObject({ waveform: "triangle", angleDeg: 0, originXPct: 50, originYPct: 50 });
  });

  it("returns no path for an empty image", () => {
    const path = generateIsometricGridPath(
      ctx({ width: 0, height: 0, values: new Uint8Array() }, isometricGridDefaults),
    );
    expect(path).toBe("");
  });

  it("produces a bounded, plot-ready triangular grid", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateIsometricGridPath(ctx(source, isometricGridDefaults, 25.4 / 96));
    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path.length).toBeLessThan(200_000);
    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  it("draws more lines than a single raster pass, from overlaying three angled families", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const isometricLines = generateIsometricGridPath(ctx(source, isometricGridDefaults)).match(/M/g)?.length ?? 0;
    const rasterLines = generateRasterLinesPath(ctx(source, isometricGridDefaults)).match(/M/g)?.length ?? 0;
    expect(isometricLines).toBeGreaterThan(rasterLines);
  });

  it("uses tone modulation only where the source is dark", () => {
    const white = generateIsometricGridPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(255) }, isometricGridDefaults),
    );
    const black = generateIsometricGridPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(0) }, isometricGridDefaults),
    );
    expect(black).not.toBe(white);
  });
});
