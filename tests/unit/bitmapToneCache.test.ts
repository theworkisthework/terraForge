import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRendererPluginStore } from "@renderer/store/rendererPluginStore";
import type { RendererPluginManifest, PluginRenderContext } from "../../src/types";

vi.mock("@renderer/features/bitmap-renderers/toneAdjust", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/features/bitmap-renderers/toneAdjust")>();
  return { ...actual, smoothSource: vi.fn(actual.smoothSource) };
});

import { clearBitmapDecodeCache, materializeBitmapLayers } from "@renderer/features/bitmap-renderers/bitmapImage";
import { smoothSource } from "@renderer/features/bitmap-renderers/toneAdjust";

const smooth = vi.mocked(smoothSource);

class FakeImage {
  naturalWidth = 8;
  naturalHeight = 8;
  onload: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const render = vi.fn(async (_id: string, _context: PluginRenderContext) => ({ status: "ok" as const, output: "M0 0 L1 1" }));
const bitmap = { id: "b", bitmapDataUrl: "data:image/png;base64,AAAA", bitmapRendererId: "acme", bitmapBaseScale: 0.25 };

beforeEach(() => {
  clearBitmapDecodeCache();
  smooth.mockClear();
  render.mockClear();
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) % 256)),
      width: w,
      height: h,
    }),
  }) as unknown as typeof originalGetContext;
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("terraForge", { rendererPlugins: { render } });
  const manifest: RendererPluginManifest = { id: "acme", label: "Acme", apiVersion: 1, defaults: {}, fields: [] };
  useRendererPluginStore.setState({ plugins: [manifest] });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.unstubAllGlobals();
  useRendererPluginStore.setState({ plugins: [] });
  clearBitmapDecodeCache();
});

describe("tone preparation caching", () => {
  it("smooths once, then re-applies only levels and contrast when those change", async () => {
    await materializeBitmapLayers({ ...bitmap, bitmapTone: { smoothingMM: 1, contrast: 1 } });
    await materializeBitmapLayers({ ...bitmap, bitmapTone: { smoothingMM: 1, contrast: 2 } });
    await materializeBitmapLayers({ ...bitmap, bitmapTone: { smoothingMM: 1, contrast: 2, autoLevels: true } });

    expect(smooth).toHaveBeenCalledTimes(1);
    // ...while the renderer did see each new contrast.
    const firstPixel = render.mock.calls.map(([, context]) => context.source!.values![0]);
    expect(new Set(firstPixel).size).toBeGreaterThan(1);
  });

  it("smooths again when smoothing itself changes", async () => {
    await materializeBitmapLayers({ ...bitmap, bitmapTone: { smoothingMM: 1 } });
    await materializeBitmapLayers({ ...bitmap, bitmapTone: { smoothingMM: 2 } });

    expect(smooth).toHaveBeenCalledTimes(2);
  });
});
