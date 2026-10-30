import { describe, expect, it } from "vitest";
import { luminanceAt } from "../../src/renderer/src/features/bitmap-renderers/toneSpine/sampling";
import type { RendererSource } from "../../src/types";

describe("luminanceAt", () => {
  it("matches the exact pixel value at integer coordinates", () => {
    const image: RendererSource = { width: 2, height: 2, values: new Uint8Array(4).fill(0) };

    expect(luminanceAt(image, 1, 1)).toBe(0);
    expect(luminanceAt(image, -1, 1)).toBe(255);
    expect(luminanceAt(image, 2, 1)).toBe(255);
    expect(luminanceAt(image, 1, 2)).toBe(255);
  });

  it("blends linearly between adjacent pixels along a single axis", () => {
    // Left column black, right column white.
    const image: RendererSource = { width: 2, height: 1, values: new Uint8Array([0, 255]) };

    expect(luminanceAt(image, 0, 0)).toBe(0);
    expect(luminanceAt(image, 1, 0)).toBe(255);
    expect(luminanceAt(image, 0.5, 0)).toBeCloseTo(127.5, 5);
    expect(luminanceAt(image, 0.25, 0)).toBeCloseTo(63.75, 5);
  });

  it("blends across both axes for a point between four pixels", () => {
    // Black top-left, white everywhere else.
    const image: RendererSource = {
      width: 2,
      height: 2,
      values: new Uint8Array([0, 255, 255, 255]),
    };

    expect(luminanceAt(image, 0.5, 0.5)).toBeCloseTo((0 + 255 + 255 + 255) / 4, 5);
  });

  it("treats a tap that reaches just past the edge as white, not a repeated edge pixel", () => {
    const image: RendererSource = { width: 2, height: 1, values: new Uint8Array([0, 0]) };

    // Halfway across the last pixel, the bilinear tap to the right reaches
    // one unit past the image edge — that neighbour is white, not black.
    expect(luminanceAt(image, 1.5, 0)).toBeCloseTo(127.5, 5);
  });
});
