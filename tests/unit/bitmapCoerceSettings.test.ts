import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coerceSettings,
  migrateSettings,
  rendererSettings,
} from "@renderer/features/bitmap-renderers/coerceSettings";
import { clearBitmapDecodeCache, materializeBitmapLayers } from "@renderer/features/bitmap-renderers/bitmapImage";
import { bitmapRenderers } from "@renderer/features/bitmap-renderers/registry";
import { useRendererPluginStore } from "@renderer/store/rendererPluginStore";
import type { RendererPluginManifest, BitmapRendererFieldSchema, PluginRenderContext } from "../../src/types";

const fields: BitmapRendererFieldSchema[] = [
  { type: "number", key: "spacing", label: "Spacing", min: 1, max: 10, step: 1 },
  { type: "boolean", key: "clip", label: "Clip" },
  {
    type: "select",
    key: "shape",
    label: "Shape",
    options: [
      { value: "round", label: "Round" },
      { value: "square", label: "Square" },
    ],
  },
];
const defaults = { spacing: 4, clip: true, shape: "square" };

describe("coerceSettings", () => {
  it("keeps valid saved values", () => {
    expect(coerceSettings(fields, defaults, { spacing: 7, clip: false, shape: "round" })).toEqual({
      spacing: 7,
      clip: false,
      shape: "round",
    });
  });

  it("fills a missing key from the defaults instead of leaving it for a renderer to read as NaN", () => {
    expect(coerceSettings(fields, defaults, {})).toEqual(defaults);
    expect(coerceSettings(fields, defaults, undefined)).toEqual(defaults);
  });

  it("replaces a non-finite or non-numeric number with the default", () => {
    for (const bad of [NaN, Infinity, "abc", "", null, {}, true]) {
      expect(coerceSettings(fields, defaults, { spacing: bad }).spacing).toBe(4);
    }
  });

  it("accepts a numeric string, as a hand-edited file might hold", () => {
    expect(coerceSettings(fields, defaults, { spacing: "6" }).spacing).toBe(6);
  });

  it("clamps a number into the field's own range", () => {
    expect(coerceSettings(fields, defaults, { spacing: 99 }).spacing).toBe(10);
    expect(coerceSettings(fields, defaults, { spacing: -3 }).spacing).toBe(1);
  });

  it("replaces a non-boolean with the default", () => {
    expect(coerceSettings(fields, defaults, { clip: "false" }).clip).toBe(true);
  });

  it("replaces a select value that is not one of its options with the default", () => {
    expect(coerceSettings(fields, defaults, { shape: "hexagon" }).shape).toBe("square");
  });

  it("falls back to the field itself when the default is unusable too", () => {
    const result = coerceSettings(fields, { spacing: NaN, clip: "yes", shape: "nope" } as never, {});
    expect(result).toEqual({ spacing: 1, clip: false, shape: "round" });
  });

  it("passes through valid settings that have no field, and drops unusable ones", () => {
    const result = coerceSettings(fields, defaults, { hidden: 3, junk: { nested: true }, gone: NaN });
    expect(result.hidden).toBe(3);
    expect(result).not.toHaveProperty("junk");
    expect(result).not.toHaveProperty("gone");
  });
});

describe("migrateSettings / rendererSettings", () => {
  const renamed = { amplitude: "amplitudeMM" };

  it("moves a value saved under a renamed key to the new key, dropping the old one", () => {
    expect(migrateSettings({ spacingMM: 3, amplitude: 4 }, renamed)).toEqual({ spacingMM: 3, amplitudeMM: 4 });
  });

  it("keeps the new key's value when both are present — it is the newer one", () => {
    expect(migrateSettings({ amplitude: 4, amplitudeMM: 7 }, renamed)).toEqual({ amplitudeMM: 7 });
  });

  it("leaves settings alone when nothing was renamed", () => {
    const settings = { spacingMM: 3 };
    expect(migrateSettings(settings, undefined)).toBe(settings);
    expect(migrateSettings(settings, renamed)).toEqual(settings);
  });

  it("gives a renderer its saved value under the new key, not the default", () => {
    const spiral = bitmapRenderers.find((renderer) => renderer.id === "spiral-amplitude")!;
    expect(rendererSettings(spiral, { amplitude: 4 })).toMatchObject({ amplitudeMM: 4 });
    expect(rendererSettings(spiral, { amplitude: 4 })).not.toHaveProperty("amplitude");
  });
});

describe("in-tree renderer schemas", () => {
  /**
   * Each renderer declares its ranges twice — in its fields and in its own
   * parsing — so a default outside the declared range is the first sign the
   * two have drifted apart.
   */
  for (const renderer of bitmapRenderers) {
    it(`${renderer.id} has an in-range default for every field`, () => {
      for (const field of renderer.fields) {
        expect(renderer.defaults, `default for ${field.key}`).toHaveProperty(field.key);
      }
      expect(coerceSettings(renderer.fields, renderer.defaults, {})).toEqual(renderer.defaults);
    });
  }
});

describe("materializeBitmapLayers settings coercion", () => {
  class FakeImage {
    naturalWidth = 40;
    naturalHeight = 40;
    onload: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    clearBitmapDecodeCache();
    const getImageData = (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(60),
      width: w,
      height: h,
    });
    HTMLCanvasElement.prototype.getContext = vi
      .fn()
      .mockReturnValue({ drawImage: vi.fn(), getImageData }) as unknown as typeof originalGetContext;
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.unstubAllGlobals();
    useRendererPluginStore.setState({ plugins: [] });
    clearBitmapDecodeCache();
  });

  for (const renderer of bitmapRenderers) {
    it(`renders ${renderer.id} from a damaged settings bag instead of failing on NaN`, async () => {
      // Every field missing or garbage, as an old or hand-edited file might be.
      const damaged = Object.fromEntries(renderer.fields.map((field, i) => [field.key, i % 2 ? "garbage" : null]));

      const result = await materializeBitmapLayers({
        id: "imp-1",
        bitmapDataUrl: "data:image/png;base64,AAAA",
        bitmapRendererId: renderer.id,
        bitmapRendererSettings: damaged as never,
        bitmapBaseScale: 0.25,
      });

      const output = result.bitmapRendererPath + result.paths.map((path) => path.d).join(" ");
      expect(output).toMatch(/^M/);
      expect(output).not.toContain("NaN");
    });
  }

  it("hands a plugin settings already forced into its declared schema", async () => {
    const manifest: RendererPluginManifest = {
      id: "acme.lines",
      label: "Acme lines",
      apiVersion: 1,
      defaults,
      fields,
    };
    useRendererPluginStore.setState({ plugins: [manifest] });
    const render = vi.fn(async (_id: string, _context: PluginRenderContext) => ({ status: "ok" as const, output: "M0 0 L1 1" }));
    vi.stubGlobal("terraForge", { rendererPlugins: { render } });

    await materializeBitmapLayers({
      id: "imp-1",
      bitmapDataUrl: "data:image/png;base64,AAAA",
      bitmapRendererId: "acme.lines",
      bitmapRendererSettings: { spacing: 500, shape: "hexagon" },
    });

    expect(render.mock.calls[0][1].settings).toEqual({ spacing: 10, clip: true, shape: "square" });
  });
});
