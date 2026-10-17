import { describe, expect, it } from "vitest";
import {
  bipolarToothPulse,
  generateSpiralAmplitudePath,
  luminanceAt,
  spiralAmplitudeDefaults,
} from "../../src/renderer/src/features/bitmap-renderers/spiralAmplitude";
import type {
  BitmapRendererSettings,
  RendererContext,
  RendererSource,
} from "../../src/types";
import { vectorObjectsForImport } from "../../src/renderer/src/store/canvasStore/services/vectorObjects";

/** Builds a render context the way the app does when a bitmap drives it. */
const ctx = (
  source: RendererSource,
  settings: BitmapRendererSettings,
  scale: number,
): RendererContext => ({
  width: source.width,
  height: source.height,
  scale,
  settings,
  source,
});

describe("generateSpiralAmplitudePath", () => {
  it("uses practical defaults for a legible initial render", () => {
    expect(spiralAmplitudeDefaults).toEqual({
      spacingMM: 8,
      toothWidthMM: 9,
      amplitude: 10,
      waveform: "triangle",
      angleDeg: 0,
      originXPct: 50,
      originYPct: 50,
      clipToImage: true,
      peakClipPct: 100,
    });
  });

  it("crosses the baseline between fixed-width positive and negative pulses", () => {
    expect(bipolarToothPulse(0)).toBe(0);
    expect(bipolarToothPulse(0.25)).toBe(1);
    expect(bipolarToothPulse(0.5)).toBe(0);
    expect(bipolarToothPulse(0.75)).toBe(-1);
    expect(bipolarToothPulse(1)).toBe(0);
  });

  it("uses a zero-amplitude white sample outside the bitmap bounds", () => {
    const image = { width: 2, height: 2, values: new Uint8Array(4).fill(0) };

    expect(luminanceAt(image, 1, 1)).toBe(0);
    expect(luminanceAt(image, -1, 1)).toBe(255);
    expect(luminanceAt(image, 2, 1)).toBe(255);
    expect(luminanceAt(image, 1, 2)).toBe(255);
  });

  it("produces a bounded plot-ready spiral for luminance data", () => {
    const path = generateSpiralAmplitudePath(ctx({ width: 20, height: 10, values: new Uint8Array(200).fill(64) }, { spacingMM: 2, toothWidthMM: 1, amplitude: 1 }, 25.4 / 96));

    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path.length).toBeLessThan(200_000);
  });

  it("returns no path for an empty image", () => {
    expect(
      generateSpiralAmplitudePath(ctx({ width: 0, height: 0, values: new Uint8Array() }, { spacingMM: 1, toothWidthMM: 1, amplitude: 1 }, 1)),
    ).toBe("");
  });

  it("uses sawtooth modulation only where the source is dark", () => {
    const white = generateSpiralAmplitudePath(ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(255) }, { spacingMM: 3, toothWidthMM: 1, amplitude: 1.5 }, 1));
    const black = generateSpiralAmplitudePath(ctx({ width: 40, height: 40, values: new Uint8Array(1600).fill(0) }, { spacingMM: 3, toothWidthMM: 1, amplitude: 1.5 }, 1));

    expect(black).not.toBe(white);
  });

  it("keeps a white bitmap on the smooth underlying spiral", () => {
    const path = generateSpiralAmplitudePath(ctx({ width: 20, height: 20, values: new Uint8Array(400).fill(255) }, { spacingMM: 3, toothWidthMM: 1, amplitude: 1.5 }, 1));

    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  it("never emits a coordinate outside a non-square image's bounds", () => {
    // Wider than tall: the spiral's farthest-corner reach would bleed past
    // the top/bottom edges without the clip-to-rect safety net.
    const width = 80;
    const height = 40;
    const path = generateSpiralAmplitudePath(
      ctx({ width, height, values: new Uint8Array(width * height).fill(64) }, { spacingMM: 3, toothWidthMM: 2, amplitude: 4 }, 1),
    );
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(0);
      expect(numbers[i]).toBeLessThanOrEqual(width);
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
      expect(numbers[i + 1]).toBeLessThanOrEqual(height);
    }
  });

  it("overflows a non-square image's bounds when clipToImage is turned off", () => {
    const width = 80;
    const height = 40;
    const path = generateSpiralAmplitudePath(
      ctx(
        { width, height, values: new Uint8Array(width * height).fill(64) },
        { spacingMM: 3, toothWidthMM: 2, amplitude: 4, clipToImage: false },
        1,
      ),
    );
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const outside = numbers.some((_, i) => {
      if (i % 2 !== 0) return false;
      return numbers[i] < 0 || numbers[i] > width || numbers[i + 1] < 0 || numbers[i + 1] > height;
    });
    expect(outside).toBe(true);
  });

  it("overflows by no more than the amplitude when clipToImage is turned off", () => {
    // A wide image: the spiral reaches its far corners, so most of each turn
    // lies outside the picture. Only the wobble may cross the edge.
    const width = 160;
    const height = 40;
    const amplitude = 4;
    const path = generateSpiralAmplitudePath(
      ctx(
        { width, height, values: new Uint8Array(width * height).fill(0) },
        { spacingMM: 3, toothWidthMM: 2, amplitude, clipToImage: false },
        1,
      ),
    );
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(numbers.length).toBeGreaterThan(0);
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(-amplitude - 0.01);
      expect(numbers[i]).toBeLessThanOrEqual(width + amplitude + 0.01);
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(-amplitude - 0.01);
      expect(numbers[i + 1]).toBeLessThanOrEqual(height + amplitude + 0.01);
    }
  });

  it("changes the render when peakClipPct is lowered from its 100% default", () => {
    const source = { width: 40, height: 40, values: new Uint8Array(1600).fill(0) };
    const unclipped = generateSpiralAmplitudePath(ctx(source, { spacingMM: 3, toothWidthMM: 2, amplitude: 4 }, 1));
    const clipped = generateSpiralAmplitudePath(
      ctx(source, { spacingMM: 3, toothWidthMM: 2, amplitude: 4, peakClipPct: 20 }, 1),
    );
    expect(clipped).not.toBe(unclipped);
  });

  it("keeps waveform sampling dense at the outer spiral", () => {
    const path = generateSpiralAmplitudePath(ctx({ width: 200, height: 200, values: new Uint8Array(40_000).fill(0) }, { spacingMM: 10, toothWidthMM: 0.1, amplitude: 2 }, 1));

    expect((path.match(/[ML]/g) ?? []).length).toBeGreaterThan(20_000);
  });

  it("projects persisted bitmap output into the G-code vector model", () => {
    const objects = vectorObjectsForImport({
      id: "bitmap-1", name: "photo", kind: "bitmap", paths: [], x: 4, y: 8,
      scale: 25.4 / 96, rotation: 15, visible: true, svgWidth: 100,
      svgHeight: 50, viewBoxX: 0, viewBoxY: 0, bitmapRendererPath: "M0 0 L10 10",
    });

    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({ path: "M0 0 L10 10", x: 4, y: 8, rotation: 15 });
  });
});