import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bitmapRenderSignature,
  clearBitmapDecodeCache,
  materializeBitmapLayers,
} from "@renderer/features/bitmap-renderers/bitmapImage";
import {
  prepareSource,
  resolveToneSettings,
  TONE_DEFAULTS,
  type ToneSettings,
} from "@renderer/features/bitmap-renderers/toneAdjust";
import { useBitmapPluginStore } from "@renderer/store/bitmapPluginStore";
import type { BitmapPluginManifest, RendererContext, RendererSource } from "@types/index";

const neutral: ToneSettings = { autoLevels: false, contrast: 1, smoothingMM: 0 };

function uniform(value: number, width = 20, height = 20): RendererSource {
  return { width, height, values: new Uint8Array(width * height).fill(value) };
}

describe("prepareSource", () => {
  it("hands back the very same source when every setting is neutral", () => {
    const source = uniform(100);
    expect(prepareSource(source, neutral, 4)).toBe(source);
  });

  it("never mutates the source it was given", () => {
    const source = uniform(100);
    source.values[0] = 0;
    const before = source.values.slice();

    prepareSource(source, { autoLevels: true, contrast: 2, smoothingMM: 1 }, 4);

    expect(source.values).toEqual(before);
  });

  describe("smoothing", () => {
    it("damps a single-pixel spike instead of passing it to the renderer", () => {
      const source = uniform(128);
      source.values[10 * 20 + 10] = 0;

      const smoothed = prepareSource(source, { ...neutral, smoothingMM: 0.5 }, 4);

      // Spread across its neighbourhood rather than a full-black pixel.
      expect(smoothed.values[10 * 20 + 10]).toBeGreaterThan(110);
      expect(smoothed.values[10 * 20 + 11]).toBeLessThan(128);
    });

    it("leaves a uniform image untouched, borders included", () => {
      const smoothed = prepareSource(uniform(90), { ...neutral, smoothingMM: 1 }, 4);
      expect(new Set(smoothed.values)).toEqual(new Set([90]));
    });

    it("is sized in mm, so the same setting blurs further on a denser image", () => {
      const spiky = (width: number) => {
        const source = uniform(128, width, 1);
        source.values[Math.floor(width / 2)] = 0;
        return source;
      };
      const reach = (source: RendererSource) => source.values.filter((v) => v < 127).length;

      const coarse = prepareSource(spiky(60), { ...neutral, smoothingMM: 1 }, 2);
      const fine = prepareSource(spiky(60), { ...neutral, smoothingMM: 1 }, 6);

      expect(reach(fine)).toBeGreaterThan(reach(coarse));
    });

    it("does nothing below one pixel of blur", () => {
      const source = uniform(128);
      source.values[0] = 0;
      expect(prepareSource(source, { ...neutral, smoothingMM: 0.1 }, 1)).toBe(source);
    });
  });

  describe("auto levels", () => {
    it("stretches an image's own range to full black and white", () => {
      const source = uniform(100);
      source.values.fill(160, 0, 200);

      const levelled = prepareSource(source, { ...neutral, autoLevels: true }, 1);

      expect(Math.min(...levelled.values)).toBe(0);
      expect(Math.max(...levelled.values)).toBe(255);
    });

    it("is not pinned by a single stray pixel", () => {
      // Mid greys plus one pure-white speck: min/max levels would treat 255
      // as the light end and barely stretch anything.
      const source = uniform(100);
      source.values.fill(160, 0, 200);
      source.values[399] = 255;

      const levelled = prepareSource(source, { ...neutral, autoLevels: true }, 1);

      expect(levelled.values[0]).toBe(255);
    });

    it("leaves a perfectly flat image as it is — there is no range to stretch", () => {
      const levelled = prepareSource(uniform(120), { ...neutral, autoLevels: true }, 1);
      expect(new Set(levelled.values)).toEqual(new Set([120]));
    });
  });

  describe("contrast", () => {
    it("pushes tone away from mid-grey above 1", () => {
      const source = { width: 2, height: 1, values: new Uint8Array([60, 200]) };
      const contrasted = prepareSource(source, { ...neutral, contrast: 2 }, 1);
      expect(contrasted.values[0]).toBeLessThan(60);
      expect(contrasted.values[1]).toBeGreaterThan(200);
    });

    it("pulls tone toward mid-grey below 1", () => {
      const source = { width: 2, height: 1, values: new Uint8Array([60, 200]) };
      const contrasted = prepareSource(source, { ...neutral, contrast: 0.5 }, 1);
      expect(contrasted.values[0]).toBeGreaterThan(60);
      expect(contrasted.values[1]).toBeLessThan(200);
    });
  });
});

describe("resolveToneSettings", () => {
  it("uses the defaults for a new import", () => {
    expect(resolveToneSettings({})).toEqual(TONE_DEFAULTS);
  });

  it("reads an older drawing's renderer-level tone settings", () => {
    expect(resolveToneSettings({ bitmapRendererSettings: { autoLevels: true, contrast: 1.5 } })).toEqual({
      ...TONE_DEFAULTS,
      autoLevels: true,
      contrast: 1.5,
    });
  });

  it("prefers explicit tone settings once they exist", () => {
    const tone = resolveToneSettings({
      bitmapTone: { autoLevels: false, contrast: 2, smoothingMM: 0 },
      bitmapRendererSettings: { autoLevels: true, contrast: 1.5 },
    });
    expect(tone).toEqual({ autoLevels: false, contrast: 2, smoothingMM: 0 });
  });

  it("forces saved values into range", () => {
    expect(resolveToneSettings({ bitmapTone: { contrast: 99, smoothingMM: -1 } })).toMatchObject({
      contrast: 3,
      smoothingMM: 0,
    });
  });
});

describe("bitmapRenderSignature and tone", () => {
  const imp = { id: "b", bitmapDataUrl: "data:x", bitmapRendererId: "spiral-amplitude", bitmapRendererSettings: {} };

  it("keeps a drawing saved before tone existed on the signature it was stored with", () => {
    // Six inputs, exactly as before tone was added — so no older drawing
    // counts as changed and re-renders unasked.
    expect(JSON.parse(bitmapRenderSignature(imp))).toHaveLength(6);
  });

  it("changes when tone is set, and when it changes", () => {
    const withTone = bitmapRenderSignature({ ...imp, bitmapTone: { contrast: 1 } });
    expect(withTone).not.toBe(bitmapRenderSignature(imp));
    expect(bitmapRenderSignature({ ...imp, bitmapTone: { contrast: 2 } })).not.toBe(withTone);
  });
});

describe("materializeBitmapLayers tone preparation", () => {
  class FakeImage {
    naturalWidth = 4;
    naturalHeight = 1;
    onload: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const render = vi.fn(async (_id: string, _context: RendererContext) => "M0 0 L1 1");

  beforeEach(() => {
    clearBitmapDecodeCache();
    render.mockClear();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(60).map((v, i) => (i % 4 === 3 ? 255 : v)),
        width: w,
        height: h,
      }),
    }) as unknown as typeof originalGetContext;
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("terraForge", { bitmapPlugins: { render } });
    const manifest: BitmapPluginManifest = { id: "acme", label: "Acme", apiVersion: 1, defaults: {}, fields: [] };
    useBitmapPluginStore.setState({ plugins: [manifest] });
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.unstubAllGlobals();
    useBitmapPluginStore.setState({ plugins: [] });
    clearBitmapDecodeCache();
  });

  const bitmap = { id: "b", bitmapDataUrl: "data:image/png;base64,AAAA", bitmapRendererId: "acme", bitmapBaseScale: 1 };

  it("hands a plugin the tone-shaped source, so plugins get tone controls for free", async () => {
    await materializeBitmapLayers({ ...bitmap, bitmapTone: { contrast: 2, smoothingMM: 0 } });

    // Luminance 60 at contrast 2: (60/255 - 0.5) * 2 + 0.5 < 0, so full black.
    expect(render.mock.calls[0][1].source!.values[0]).toBe(0);
  });

  it("reuses the prepared source when only renderer settings change", async () => {
    await materializeBitmapLayers({ ...bitmap, bitmapRendererSettings: { a: 1 } });
    await materializeBitmapLayers({ ...bitmap, bitmapRendererSettings: { a: 2 } });

    expect(render.mock.calls[1][1].source).toBe(render.mock.calls[0][1].source);
  });

  it("prepares the source again when tone changes", async () => {
    await materializeBitmapLayers({ ...bitmap, bitmapTone: { contrast: 1 } });
    await materializeBitmapLayers({ ...bitmap, bitmapTone: { contrast: 2 } });

    expect(render.mock.calls[1][1].source).not.toBe(render.mock.calls[0][1].source);
  });

  it("shapes each ink channel under colour separation", async () => {
    await materializeBitmapLayers({ ...bitmap, bitmapSeparationMode: "cmy", bitmapTone: { contrast: 2, smoothingMM: 0 } });

    expect(render).toHaveBeenCalledTimes(3);
    for (const [, context] of render.mock.calls) {
      expect(context.source!.values[0]).not.toBe(60);
    }
  });
});
