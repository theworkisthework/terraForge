import { describe, it, expect } from "vitest";
import {
  separateCMY,
  separateCMYK,
  separateCustomPalette,
  separateRGB,
} from "../../src/renderer/src/features/bitmap-renderers/colourSeparation";
import type { BitmapColorData } from "../../src/renderer/src/features/bitmap-renderers/bitmapImage";

function uniformImage(r: number, g: number, b: number, width = 2, height = 2): BitmapColorData {
  const pixelCount = width * height;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

describe("separateRGB", () => {
  it("gives full ink (luminance 0) for a pixel's own primary and no ink for the others", () => {
    const [red, green, blue] = separateRGB(uniformImage(255, 0, 0));
    expect(red.label).toBe("Red");
    expect(red.luminance.values[0]).toBe(0);
    expect(green.luminance.values[0]).toBe(255);
    expect(blue.luminance.values[0]).toBe(255);
  });

  it("gives no ink anywhere for a black pixel", () => {
    const channels = separateRGB(uniformImage(0, 0, 0));
    for (const channel of channels) expect(channel.luminance.values[0]).toBe(255);
  });

  it("preserves the source image dimensions", () => {
    const channels = separateRGB(uniformImage(1, 2, 3, 4, 5));
    for (const channel of channels) {
      expect(channel.luminance.width).toBe(4);
      expect(channel.luminance.height).toBe(5);
      expect(channel.luminance.values).toHaveLength(20);
    }
  });
});

describe("separateCMY", () => {
  it("needs magenta and yellow but no cyan for a pure red pixel", () => {
    const [cyan, magenta, yellow] = separateCMY(uniformImage(255, 0, 0));
    expect(cyan.luminance.values[0]).toBe(255); // no cyan ink
    expect(magenta.luminance.values[0]).toBe(0); // full magenta ink
    expect(yellow.luminance.values[0]).toBe(0); // full yellow ink
  });

  it("needs no ink anywhere for a white pixel", () => {
    const channels = separateCMY(uniformImage(255, 255, 255));
    for (const channel of channels) expect(channel.luminance.values[0]).toBe(255);
  });
});

describe("separateCMYK", () => {
  it("routes a black pixel entirely to the black channel", () => {
    const [cyan, magenta, yellow, black] = separateCMYK(uniformImage(0, 0, 0));
    expect(black.label).toBe("Black");
    expect(black.luminance.values[0]).toBe(0); // full black ink
    expect(cyan.luminance.values[0]).toBe(255);
    expect(magenta.luminance.values[0]).toBe(255);
    expect(yellow.luminance.values[0]).toBe(255);
  });

  it("needs no ink anywhere for a white pixel", () => {
    const channels = separateCMYK(uniformImage(255, 255, 255));
    for (const channel of channels) expect(channel.luminance.values[0]).toBe(255);
  });

  it("removes black from a saturated red pixel via under-colour removal", () => {
    const [cyan, magenta, yellow, black] = separateCMYK(uniformImage(255, 0, 0));
    expect(black.luminance.values[0]).toBe(255); // no black needed
    expect(cyan.luminance.values[0]).toBe(255); // no cyan needed
    expect(magenta.luminance.values[0]).toBe(0);
    expect(yellow.luminance.values[0]).toBe(0);
  });
});

describe("separateCustomPalette", () => {
  it("gives full ink where a pixel exactly matches a swatch", () => {
    const [channel] = separateCustomPalette(uniformImage(10, 20, 30), [
      { label: "Custom", color: "#0a141e" }, // exactly (10, 20, 30)
    ]);
    expect(channel.luminance.values[0]).toBe(0);
  });

  it("gives no ink where a pixel is maximally distant from a swatch", () => {
    const [channel] = separateCustomPalette(uniformImage(255, 255, 255), [
      { label: "Black swatch", color: "#000000" },
    ]);
    expect(channel.luminance.values[0]).toBe(255);
  });

  it("produces one channel per palette entry, each carrying its own colour", () => {
    const channels = separateCustomPalette(uniformImage(128, 128, 128), [
      { label: "A", color: "#ff0000" },
      { label: "B", color: "#00ff00" },
    ]);
    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({ label: "A", color: "#ff0000" });
    expect(channels[1]).toMatchObject({ label: "B", color: "#00ff00" });
  });
});
