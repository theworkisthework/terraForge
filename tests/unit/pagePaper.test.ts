import { describe, expect, it } from "vitest";
import { isLightPaper, pageColors, selectionShade } from "@renderer/utils/paper";
import { bitmapRenderSignature, bitmapSurface } from "@renderer/features/bitmap-renderers/bitmapImage";
import { separateColours } from "@renderer/features/bitmap-renderers/colourSeparation";
import { mixInks, type InkColour } from "@renderer/features/bitmap-renderers/inkUnmixing";
import type { BitmapColorData } from "@renderer/features/bitmap-renderers/bitmapImage";

function uniformImage(r: number, g: number, b: number): BitmapColorData {
  const rgba = new Uint8Array(4 * 4);
  for (let i = 0; i < 4; i++) rgba.set([r, g, b, 255], i * 4);
  return { width: 2, height: 2, rgba };
}

const hex = (color: string): InkColour => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as unknown as InkColour;

/** Coverage (0–1) per ink, for a uniform colour on `paper`. */
function coverages(rgb: [number, number, number], mode: Parameters<typeof separateColours>[1], paper: string, palette: string[] = []) {
  const channels = separateColours(uniformImage(...rgb), mode, palette.map((color, i) => ({ label: `${i}`, color })), paper);
  return { channels, d: channels.map((channel) => (255 - channel.luminance.values[0]) / 255) };
}

describe("page colours", () => {
  it("are white paper and a black pen unless the page says otherwise, and absent without a page", () => {
    expect(pageColors(null)).toBeNull();
    expect(pageColors({ sizeId: "a4", landscape: false, marginMM: 10 })).toEqual({ paper: "#ffffff", pen: "#000000" });
    expect(pageColors({ sizeId: "a4", landscape: false, marginMM: 10, paperColor: "#F3ECD8", penColor: "#fff" })).toEqual({
      paper: "#f3ecd8",
      pen: "#ffffff",
    });
  });

  it("tells light paper from dark", () => {
    expect(isLightPaper("#f3ecd8")).toBe(true);
    expect(isLightPaper("#141414")).toBe(false);
  });

  it("shades a selection visibly for any pen, black and white included", () => {
    expect(selectionShade("#000000")).not.toBe("#000000");
    expect(selectionShade("#ffffff")).not.toBe("#ffffff");
  });
});

describe("bitmap surface", () => {
  const white = { paper: "#ffffff", pen: "#000000" };

  it("asks for nothing on a plain page, so drawings keep their signatures", () => {
    for (const mode of ["none", "cmy", "cmyk", "rgb-white", "custom"] as const) {
      expect(bitmapSurface(mode, white)).toEqual({});
      expect(bitmapSurface(mode, null)).toEqual({});
    }
    const imp = { id: "b", bitmapDataUrl: "data:x", bitmapSeparationMode: "cmyk" as const };
    expect(bitmapRenderSignature(imp, {})).toBe(bitmapRenderSignature(imp));
  });

  it("separates against a page's paper when it is not the mode's own", () => {
    expect(bitmapSurface("cmyk", { paper: "#f3ecd8", pen: "#000000" })).toEqual({ paper: "#f3ecd8" });
    // Light-on-dark RGB is made for black paper, so white is the change.
    expect(bitmapSurface("rgb", white)).toEqual({ paper: "#ffffff" });
  });

  it("inverts an unseparated bitmap when the pen is lighter than the paper", () => {
    expect(bitmapSurface(undefined, { paper: "#141414", pen: "#ffffff" })).toEqual({ invert: true });
    expect(bitmapSurface(undefined, { paper: "#141414", pen: "#000000" })).toEqual({});
  });

  it("re-renders a drawing whose paper changes", () => {
    const imp = { id: "b", bitmapDataUrl: "data:x", bitmapSeparationMode: "cmyk" as const };
    expect(bitmapRenderSignature(imp, { paper: "#f3ecd8" })).not.toBe(bitmapRenderSignature(imp));
  });
});

describe("separation against the paper", () => {
  it("keeps each mode's exact formula on its own paper", () => {
    const onWhite = coverages([200, 90, 40], "cmy", "#ffffff").d;
    expect(onWhite.map((d) => Math.round(d * 255))).toEqual([55, 165, 215]);
  });

  it("puts no ink where the image matches cream paper, and reproduces colours on it", () => {
    const cream = "#f3ecd8";
    expect(coverages([243, 236, 216], "cmyk", cream).d.every((d) => d < 0.02)).toBe(true);
    for (const rgb of [[200, 90, 40], [60, 120, 160]] as [number, number, number][]) {
      const { channels, d } = coverages(rgb, "cmyk", cream);
      const made = mixInks(d, channels.map((c) => hex(c.color)), hex(cream)).map((v) => v * 255);
      made.forEach((v, c) => expect(Math.abs(v - rgb[c])).toBeLessThanOrEqual(4));
    }
  });

  it("on black paper, lays light pens where the image is light and leaves the dark bare", () => {
    const pens = ["#ffffff", "#ffd000"];
    expect(coverages([255, 255, 255], "custom", "#000000", pens).d).toEqual([1, 0]);
    expect(coverages([0, 0, 0], "custom", "#000000", pens).d).toEqual([0, 0]);
    const yellow = coverages([255, 208, 0], "custom", "#000000", pens).d;
    expect(yellow[1]).toBeGreaterThan(0.95);
    expect(yellow[0]).toBeLessThan(0.05);
  });

  it("copes with paper no pen can change, asking for no ink rather than failing", () => {
    // Black pen on black paper: nothing it can do shows.
    expect(coverages([128, 128, 128], "custom", "#000000", ["#000000"]).d).toEqual([0]);
  });
});
