import { describe, expect, it } from "vitest";
import {
  circularRingsDefaults,
  generateCircularRingsPath,
} from "../../src/renderer/src/features/bitmap-renderers/circularRings";
import type { BitmapRendererSettings, RendererContext, RendererSource } from "../../src/types";

const ctx = (source: RendererSource, settings: BitmapRendererSettings, scale = 1): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("generateCircularRingsPath", () => {
  it("uses practical defaults for a legible initial render", () => {
    expect(circularRingsDefaults).toMatchObject({ waveform: "triangle", angleDeg: 0, originXPct: 50, originYPct: 50 });
  });

  it("returns no path for an empty image", () => {
    const path = generateCircularRingsPath(
      ctx({ width: 0, height: 0, values: new Uint8Array() }, circularRingsDefaults),
    );
    expect(path).toBe("");
  });

  it("produces a bounded, plot-ready set of rings", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateCircularRingsPath(ctx(source, circularRingsDefaults, 25.4 / 96));
    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path.length).toBeLessThan(200_000);
    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  it("draws more than one ring for an image larger than the ring spacing", () => {
    const source = { width: 60, height: 60, values: new Uint8Array(3600).fill(64) };
    const path = generateCircularRingsPath(ctx(source, circularRingsDefaults, 25.4 / 96));
    expect(path.match(/M/g)?.length ?? 0).toBeGreaterThan(1);
  });

  it("uses tone modulation only where the source is dark", () => {
    const white = generateCircularRingsPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(255) }, circularRingsDefaults),
    );
    const black = generateCircularRingsPath(
      ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(0) }, circularRingsDefaults),
    );
    expect(black).not.toBe(white);
  });

  it("shifts the ring centre when the origin settings move", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const centred = generateCircularRingsPath(ctx(source, circularRingsDefaults));
    const offset = generateCircularRingsPath(
      ctx(source, { ...circularRingsDefaults, originXPct: 20, originYPct: 20 }),
    );
    expect(offset).not.toBe(centred);
  });
});
