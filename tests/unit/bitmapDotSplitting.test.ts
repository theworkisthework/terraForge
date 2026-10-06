import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBitmapDecodeCache,
  materializeBitmapLayers,
  splitDotPaths,
} from "@renderer/features/bitmap-renderers/bitmapImage";

describe("splitDotPaths", () => {
  it("splits a multi-subpath d string into one SvgPath per dot", () => {
    const d = "M0 0 L2 0 L2 2 L0 2 Z M10 10 L12 10 L12 12 L10 12 Z";
    const paths = splitDotPaths("imp-1", d);

    expect(paths).toHaveLength(2);
    expect(paths[0].d).toBe("M0 0 L2 0 L2 2 L0 2 Z");
    expect(paths[1].d).toBe("M10 10 L12 10 L12 12 L10 12 Z");
  });

  it("marks every dot fillable, with a pointTap at its vertex centroid", () => {
    const d = "M0 0 L4 0 L4 4 L0 4 Z";
    const [dot] = splitDotPaths("imp-1", d);

    expect(dot.hasFill).toBe(true);
    expect(dot.sourceOutlineVisible).toBe(true);
    expect(dot.pointTap).toEqual({ x: 2, y: 2 });
  });

  it("gives every dot a stable, unique id derived from the import", () => {
    const paths = splitDotPaths("imp-7", "M0 0 L1 0 Z M2 2 L3 2 Z");
    expect(paths.map((p) => p.id)).toEqual(["imp-7-dot-0", "imp-7-dot-1"]);
  });

  it("returns nothing for an empty path", () => {
    expect(splitDotPaths("imp-1", "")).toEqual([]);
  });
});

describe("materializeBitmapLayers with a dot-producing renderer", () => {
  const getImageData = vi.fn();
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  class FakeImage {
    naturalWidth = 20;
    naturalHeight = 20;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  beforeEach(() => {
    clearBitmapDecodeCache();
    getImageData.mockReset();
    // Mid-grey source so every halftone cell samples a non-trivial dot.
    getImageData.mockImplementation((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(128),
      width: w,
      height: h,
    }));
    HTMLCanvasElement.prototype.getContext = vi
      .fn()
      .mockReturnValue({ drawImage: vi.fn(), getImageData }) as unknown as typeof originalGetContext;
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.unstubAllGlobals();
    clearBitmapDecodeCache();
  });

  it("produces one fillable, plot-tappable SvgPath per dot for dot-halftone", async () => {
    const result = await materializeBitmapLayers({
      id: "imp-1",
      bitmapDataUrl: "data:image/png;base64,AAAA",
      bitmapRendererId: "dot-halftone",
    });

    expect(result.bitmapRendererPath).toBe("");
    expect(result.paths.length).toBeGreaterThan(0);
    for (const path of result.paths) {
      expect(path.hasFill).toBe(true);
      expect(path.pointTap).toBeDefined();
    }
  });

  it("leaves a non-dot renderer's legacy single-path output unchanged", async () => {
    const result = await materializeBitmapLayers({
      id: "imp-1",
      bitmapDataUrl: "data:image/png;base64,AAAA",
      bitmapRendererId: "spiral-amplitude",
    });

    expect(result.paths).toEqual([]);
    expect(result.bitmapRendererPath).toMatch(/^M/);
  });

  it("also splits into fillable, plot-tappable, per-channel-coloured dots under colour separation", async () => {
    const result = await materializeBitmapLayers({
      id: "imp-1",
      bitmapDataUrl: "data:image/png;base64,AAAA",
      bitmapRendererId: "dot-halftone",
      bitmapSeparationMode: "cmy",
    });

    expect(result.bitmapRendererPath).toBe("");
    expect(result.paths.length).toBeGreaterThan(0);
    const colors = new Set(result.paths.map((p) => p.fillColor));
    // Cyan/Magenta/Yellow: three distinctly-coloured sets of dots, not one.
    expect(colors.size).toBe(3);
    for (const path of result.paths) {
      expect(path.hasFill).toBe(true);
      expect(path.pointTap).toBeDefined();
      expect(path.fillColor).toBeDefined();
    }
    // No id collisions between channels' dots.
    expect(new Set(result.paths.map((p) => p.id)).size).toBe(result.paths.length);
  });
});
