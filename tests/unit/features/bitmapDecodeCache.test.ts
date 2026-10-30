import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearBitmapDecodeCache,
  decodeBitmapColor,
  decodeBitmapLuminance,
} from "@renderer/features/bitmap-renderers/bitmapImage";

const getImageData = vi.fn();
const originalGetContext = HTMLCanvasElement.prototype.getContext;

/** An Image that resolves as soon as a src is assigned. */
class FakeImage {
  naturalWidth = 2;
  naturalHeight = 2;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  clearBitmapDecodeCache();
  getImageData.mockReset();
  getImageData.mockImplementation((_x: number, _y: number, w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4).fill(255),
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

describe("bitmap decode cache", () => {
  it("decodes a given data URL once however many renders read it", async () => {
    await decodeBitmapLuminance("data:image/png;base64,AAAA");
    await decodeBitmapLuminance("data:image/png;base64,AAAA");
    await decodeBitmapLuminance("data:image/png;base64,AAAA");

    expect(getImageData).toHaveBeenCalledTimes(1);
  });

  it("shares one decode between the luminance and the colour path", async () => {
    await decodeBitmapLuminance("data:image/png;base64,AAAA");
    await decodeBitmapColor("data:image/png;base64,AAAA");

    expect(getImageData).toHaveBeenCalledTimes(1);
  });

  it("decodes again when a different bitmap is rendered", async () => {
    await decodeBitmapLuminance("data:image/png;base64,AAAA");
    await decodeBitmapLuminance("data:image/png;base64,BBBB");

    expect(getImageData).toHaveBeenCalledTimes(2);
  });

  it("still returns correct pixel data from the cached decode", async () => {
    const first = await decodeBitmapLuminance("data:image/png;base64,AAAA");
    const second = await decodeBitmapLuminance("data:image/png;base64,AAAA");

    expect(first.width).toBe(2);
    expect(first.height).toBe(2);
    expect(Array.from(second.values)).toEqual(Array.from(first.values));
  });
});
