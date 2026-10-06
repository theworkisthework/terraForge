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
    expect(radialBurstDefaults).toMatchObject({ rayCount: 36, waveform: "triangle", angleDeg: 0, originXPct: 50, originYPct: 50 });
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

  it("draws one ray per rayCount", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(64) };
    const path = generateRadialBurstPath(ctx(source, { ...radialBurstDefaults, rayCount: 8 }));
    expect(path.match(/M/g)).toHaveLength(8);
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
