import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBitmapDecodeCache,
  materializeBitmapLayers,
  dotPaths,
} from "@renderer/features/bitmap-renderers/bitmapImage";

describe("dotPaths", () => {
  const dots = [
    { d: "M0 0 L2 0 L2 2 L0 2 Z", x: 1, y: 1 },
    { d: "M10 10 L12 10 L12 12 L10 12 Z", x: 11, y: 11 },
  ];

  it("turns each dot into its own SvgPath, outline unchanged", () => {
    const paths = dotPaths("imp-1", dots);
    expect(paths.map((path) => path.d)).toEqual(dots.map((dot) => dot.d));
  });

  it("marks every dot fillable, tapped exactly where the renderer said", () => {
    const [first, second] = dotPaths("imp-1", dots);
    expect(first.hasFill).toBe(true);
    expect(first.sourceOutlineVisible).toBe(true);
    expect(first.pointTap).toEqual({ x: 1, y: 1 });
    expect(second.pointTap).toEqual({ x: 11, y: 11 });
  });

  it("gives every dot a stable, unique id derived from the import", () => {
    expect(dotPaths("imp-7", dots).map((p) => p.id)).toEqual(["imp-7-dot-0", "imp-7-dot-1"]);
    expect(dotPaths("imp-7", dots, { idPrefix: "ink-2" }).map((p) => p.id)).toEqual(["imp-7-ink-2-0", "imp-7-ink-2-1"]);
  });

  it("returns nothing for no dots", () => {
    expect(dotPaths("imp-1", [])).toEqual([]);
  });
});

describe("materializeBitmapLayers with a renderer that returns dots", () => {
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
