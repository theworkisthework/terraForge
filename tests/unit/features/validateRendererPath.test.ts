import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateRendererPath } from "@renderer/features/bitmap-renderers/validatePath";
import {
  clearBitmapDecodeCache,
  materializeBitmapLayers,
} from "@renderer/features/bitmap-renderers/bitmapImage";
import { useBitmapPluginStore } from "@renderer/store/bitmapPluginStore";
import { MAX_BITMAP_RENDERER_PATH_LENGTH } from "@types/index";
import type { BitmapPluginManifest } from "@types/index";

describe("validateRendererPath", () => {
  it("accepts realistic path data", () => {
    const path = "M0 0 L10.5,-3 C1 2 3 4 5 6 A5 5 0 0 1 10 10 q1.5e2 -2 3 4 Z";
    expect(validateRendererPath(path, "spiral-amplitude")).toBe(path);
  });

  it("accepts an empty path", () => {
    expect(validateRendererPath("", "spiral-amplitude")).toBe("");
  });

  it.each([
    ["NaN coordinates", "M0 0 LNaN NaN"],
    ["Infinity", "M0 0 L10 Infinity"],
    ["undefined", "M0 0 Lundefined 4"],
    ["null", "M0 0 Lnull 4"],
    ["an object stringified into the path", "M0 0 L[object Object] 4"],
  ])("rejects %s", (_label, path) => {
    expect(() => validateRendererPath(path, "acme")).toThrow(/invalid path data/);
  });

  it("names the renderer and where the bad data starts", () => {
    expect(() => validateRendererPath("M0 0 LNaN 4", "acme.halftone")).toThrow(
      /Renderer "acme\.halftone" returned invalid path data at character 6/,
    );
  });

  it("rejects a non-string result", () => {
    expect(() => validateRendererPath(undefined, "acme")).toThrow(/returned undefined instead/);
    expect(() => validateRendererPath(42, "acme")).toThrow(/returned number instead/);
  });

  it("rejects output past the size ceiling", () => {
    const runaway = "M".repeat(MAX_BITMAP_RENDERER_PATH_LENGTH + 1);
    expect(() => validateRendererPath(runaway, "acme")).toThrow(/over the \d+ limit/);
  });
});

describe("materializeBitmapLayers output checking", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  class FakeImage {
    naturalWidth = 2;
    naturalHeight = 2;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  const manifest: BitmapPluginManifest = {
    id: "acme",
    label: "Acme",
    apiVersion: 1,
    defaults: {},
    fields: [],
  };

  beforeEach(() => {
    clearBitmapDecodeCache();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(255),
        width: w,
        height: h,
      }),
    }) as unknown as typeof originalGetContext;
    vi.stubGlobal("Image", FakeImage);
    useBitmapPluginStore.setState({ plugins: [manifest], errors: [], scanning: false, actionError: null });
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.unstubAllGlobals();
    clearBitmapDecodeCache();
  });

  const bitmap = {
    id: "bmp",
    bitmapDataUrl: "data:image/png;base64,AAAA",
    bitmapRendererId: "acme",
    bitmapRendererSettings: {},
    bitmapBaseScale: 1,
  };

  it("refuses a plugin's malformed path instead of storing it as geometry", async () => {
    (window as any).terraForge.bitmapPlugins.render.mockResolvedValue("M0 0 LNaN NaN");

    await expect(materializeBitmapLayers(bitmap)).rejects.toThrow(/invalid path data/);
  });

  it("passes a well-formed path through untouched", async () => {
    (window as any).terraForge.bitmapPlugins.render.mockResolvedValue("M0 0 L1 1");

    await expect(materializeBitmapLayers(bitmap)).resolves.toEqual({
      bitmapRendererPath: "M0 0 L1 1",
      paths: [],
    });
  });

  it("checks every ink channel when colour separation is active", async () => {
    (window as any).terraForge.bitmapPlugins.render
      .mockResolvedValueOnce("M0 0 L1 1")
      .mockResolvedValueOnce("M0 0 L1 1")
      .mockResolvedValueOnce("M0 0 LInfinity 1");

    await expect(
      materializeBitmapLayers({ ...bitmap, bitmapSeparationMode: "rgb" }),
    ).rejects.toThrow(/invalid path data/);
  });
});
