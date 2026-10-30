import { describe, it, expect } from "vitest";
import {
  separateCMY,
  separateCMYK,
  separateCustomPalette,
  separateRGB,
  separateRGBOnWhite,
} from "../../src/renderer/src/features/bitmap-renderers/colourSeparation";
import type { BitmapColorData } from "../../src/renderer/src/features/bitmap-renderers/bitmapImage";
import { mixInks, type InkColour } from "../../src/renderer/src/features/bitmap-renderers/inkUnmixing";

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

/** Ink coverage (0 = none, 255 = full) per channel, from separated channels. */
const coverage = (channels: { luminance: { values: Uint8Array } }[]) => channels.map((channel) => 255 - channel.luminance.values[0]);

/** The colour (0–255) a separation's inks make, multiplied onto white paper. */
function remix(channels: { color: string; luminance: { values: Uint8Array } }[]): number[] {
  const inks = channels.map(({ color }) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as unknown as InkColour);
  return mixInks(coverage(channels).map((value) => value / 255), inks).map((value) => value * 255);
}

const expectColourNear = (actual: number[], expected: number[], tolerance = 3) =>
  actual.forEach((value, c) => expect(Math.abs(value - expected[c]), `channel ${c}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance));

describe("separateRGBOnWhite", () => {
  const inks = (r: number, g: number, b: number) => coverage(separateRGBOnWhite(uniformImage(r, g, b)));

  it("puts no ink on white paper where the image is white", () => {
    expect(inks(255, 255, 255)).toEqual([0, 0, 0]);
  });

  it("draws a pure primary with that primary's pen alone", () => {
    expect(inks(255, 0, 0)).toEqual([255, 0, 0]);
    expect(inks(0, 255, 0)).toEqual([0, 255, 0]);
    expect(inks(0, 0, 255)).toEqual([0, 0, 255]);
  });

  it("makes black and greys as the pens would on paper", () => {
    expectColourNear(remix(separateRGBOnWhite(uniformImage(0, 0, 0))), [0, 0, 0]);
    expectColourNear(remix(separateRGBOnWhite(uniformImage(128, 128, 128))), [128, 128, 128]);
  });

  it("gets back any colour the pens can mix", () => {
    const pens: InkColour[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const mix of [[0.3, 0.6, 0.1], [0.8, 0.2, 0.5], [0, 0.4, 0.9]]) {
      const colour = mixInks(mix, pens).map((value) => Math.round(value * 255));
      expectColourNear(remix(separateRGBOnWhite(uniformImage(colour[0], colour[1], colour[2]))), colour);
    }
  });

  it("draws a colour the pens cannot mix as the nearest mix they can, never negative ink", () => {
    // A strong cyan would need negative red ink; red is left off instead.
    const [r, g, b] = inks(30, 160, 220);
    expect(r).toBe(0);
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(g);
  });

  it("labels and colours its channels like the dark-paper mode", () => {
    expect(separateRGBOnWhite(uniformImage(0, 0, 0)).map((c) => [c.label, c.color])).toEqual([
      ["Red", "#ff0000"],
      ["Green", "#00ff00"],
      ["Blue", "#0000ff"],
    ]);
  });
});

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
  const separate = (rgb: [number, number, number], colors: string[]) =>
    separateCustomPalette(uniformImage(...rgb), colors.map((color, i) => ({ label: `Ink ${i + 1}`, color })));

  it("gives full ink where a pixel exactly matches a swatch, and none of the others", () => {
    // Within an 8-bit step: interpolating the solved grid, and the small charge per unit of ink.
    expect(coverage(separate([10, 20, 30], ["#0a141e"]))[0]).toBeGreaterThanOrEqual(253);
    expect(coverage(separate([255, 255, 0], ["#000000", "#ffff00"]))).toEqual([0, 255]);
  });

  it("puts no ink on white paper", () => {
    expect(coverage(separate([255, 255, 255], ["#000000", "#ffff00", "#ff8800"]))).toEqual([0, 0, 0]);
  });

  it("does not add a light ink to black — the black pen alone makes it", () => {
    // Scoring each ink by colour distance put 18% yellow over black, and 42%
    // yellow over the whole of a white page.
    expect(coverage(separate([0, 0, 0], ["#000000", "#ffff00"]))).toEqual([255, 0]);
  });

  it("uses least ink where several mixes match: a black pen rather than three colours", () => {
    expect(coverage(separate([0, 0, 0], ["#00ffff", "#ff00ff", "#ffff00", "#000000"]))).toEqual([0, 0, 0, 255]);
  });

  it("reproduces any colour within the pens' reach", () => {
    const colors = ["#00ffff", "#ff00ff", "#ffff00", "#000000"];
    for (const rgb of [[30, 160, 220], [200, 90, 40], [128, 128, 128], [90, 200, 120]] as [number, number, number][]) {
      expectColourNear(remix(separate(rgb, colors)), rgb);
    }
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
