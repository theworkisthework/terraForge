import { describe, expect, it } from "vitest";
import {
  dotHalftoneDefaults,
  dotHalftoneRenderer,
  generateDotHalftonePath,
} from "../../src/renderer/src/features/bitmap-renderers/dotHalftone";
import type { BitmapRendererSettings, RendererContext, RendererSource } from "../../src/types";

const ctx = (source: RendererSource, settings: BitmapRendererSettings, scale = 1): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("dotHalftoneRenderer", () => {
  it("declares itself a dot-producing renderer", () => {
    expect(dotHalftoneRenderer.producesDots).toBe(true);
  });

  it("uses practical defaults for a legible initial render", () => {
    expect(dotHalftoneDefaults).toMatchObject({ dotScale: 1, angleDeg: 0, originXPct: 50, originYPct: 50 });
  });
});

describe("generateDotHalftonePath", () => {
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
});
