import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBitmapDecodeCache,
  loadBitmapForImport,
  materializeBitmapLayers,
  MAX_SOURCE_PX_PER_MM,
} from "@renderer/features/bitmap-renderers/bitmapImage";

/** An Image whose size is set per test, counting how often images are decoded. */
class FakeImage {
  static size = { width: 0, height: 0 };
  static created = 0;
  naturalWidth = FakeImage.size.width;
  naturalHeight = FakeImage.size.height;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.created++;
  }
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
const drawImage = vi.fn();
const toDataURL = vi.fn((type?: string) => `data:${type};base64,SMALLER`);

beforeEach(() => {
  clearBitmapDecodeCache();
  FakeImage.created = 0;
  drawImage.mockClear();
  toDataURL.mockClear();
  vi.stubGlobal("Image", FakeImage);
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(255),
      width: w,
      height: h,
    }),
  }) as unknown as typeof originalGetContext;
  HTMLCanvasElement.prototype.toDataURL = toDataURL as unknown as typeof originalToDataURL;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
  vi.unstubAllGlobals();
  clearBitmapDecodeCache();
});

const bytes = new Uint8Array([1, 2, 3]);

describe("loadBitmapForImport", () => {
  it("keeps an image at a resolution the pen can use exactly as it is", async () => {
    FakeImage.size = { width: 4000, height: 3000 };
    // 0.1 mm per pixel: 10 px/mm, under the cap.
    const loaded = await loadBitmapForImport(bytes, "image/jpeg", () => 0.1);

    expect(loaded).toEqual({ dataUrl: "data:image/jpeg;base64,AQID", width: 4000, height: 3000, baseScale: 0.1 });
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("stores a far higher-resolution image smaller, at the same physical size", async () => {
    FakeImage.size = { width: 12000, height: 8000 };
    // Placed at 0.02 mm per pixel: 50 px/mm, well past the cap.
    const loaded = await loadBitmapForImport(bytes, "image/png", () => 0.02);

    const shrink = MAX_SOURCE_PX_PER_MM * 0.02;
    expect(loaded.width).toBe(Math.round(12000 * shrink));
    expect(loaded.height).toBe(Math.round(8000 * shrink));
    expect(1 / loaded.baseScale).toBeCloseTo(MAX_SOURCE_PX_PER_MM, 6);
    // Same size on the bed: 12000 px x 0.02 mm.
    expect(loaded.width * loaded.baseScale).toBeCloseTo(240, 6);
    expect(loaded.dataUrl).toBe("data:image/png;base64,SMALLER");
    expect(toDataURL).toHaveBeenCalledWith("image/png", 0.92);
  });

  it("leaves the decoded pixels for the first render, so the image is decoded only once", async () => {
    FakeImage.size = { width: 40, height: 30 };
    const loaded = await loadBitmapForImport(bytes, "image/png", () => 0.25);
    expect(FakeImage.created).toBe(1);

    await materializeBitmapLayers({
      id: "imp",
      bitmapDataUrl: loaded.dataUrl,
      bitmapRendererId: "raster-lines",
      bitmapBaseScale: loaded.baseScale,
    });

    expect(FakeImage.created).toBe(1);
  });
});
