import { describe, expect, it } from "vitest";
import {
  bipolarToothPulse,
  generateSpiralAmplitudePath,
  luminanceAt,
  spiralAmplitudeDefaults,
} from "../../src/renderer/src/features/bitmap-renderers/spiralAmplitude";
import { vectorObjectsForImport } from "../../src/renderer/src/store/canvasStore/services/vectorObjects";

describe("generateSpiralAmplitudePath", () => {
  it("uses practical defaults for a legible initial render", () => {
    expect(spiralAmplitudeDefaults).toEqual({
      spacingMM: 8,
      toothWidthMM: 9,
      amplitude: 10,
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
    const path = generateSpiralAmplitudePath(
      { width: 20, height: 10, values: new Uint8Array(200).fill(64) },
      { spacingMM: 2, toothWidthMM: 1, amplitude: 1 },
      25.4 / 96,
    );

    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path.length).toBeLessThan(200_000);
  });

  it("returns no path for an empty image", () => {
    expect(
      generateSpiralAmplitudePath(
        { width: 0, height: 0, values: new Uint8Array() },
        { spacingMM: 1, toothWidthMM: 1, amplitude: 1 },
        1,
      ),
    ).toBe("");
  });

  it("uses sawtooth modulation only where the source is dark", () => {
    const white = generateSpiralAmplitudePath(
      { width: 40, height: 40, values: new Uint8Array(1600).fill(255) },
      { spacingMM: 3, toothWidthMM: 1, amplitude: 1.5 },
      1,
    );
    const black = generateSpiralAmplitudePath(
      { width: 40, height: 40, values: new Uint8Array(1600).fill(0) },
      { spacingMM: 3, toothWidthMM: 1, amplitude: 1.5 },
      1,
    );

    expect(black).not.toBe(white);
  });

  it("keeps a white bitmap on the smooth underlying spiral", () => {
    const path = generateSpiralAmplitudePath(
      { width: 20, height: 20, values: new Uint8Array(400).fill(255) },
      { spacingMM: 3, toothWidthMM: 1, amplitude: 1.5 },
      1,
    );

    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  it("keeps waveform sampling dense at the outer spiral", () => {
    const path = generateSpiralAmplitudePath(
      { width: 200, height: 200, values: new Uint8Array(40_000).fill(0) },
      { spacingMM: 10, toothWidthMM: 0.1, amplitude: 2 },
      1,
    );

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