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
