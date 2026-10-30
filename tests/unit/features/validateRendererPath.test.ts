import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateRendererOutput,
  validateRendererPath,
} from "@renderer/features/bitmap-renderers/validatePath";
import {
  clearBitmapDecodeCache,
  materializeBitmapLayers,
} from "@renderer/features/bitmap-renderers/bitmapImage";
import { useRendererPluginStore } from "@renderer/store/rendererPluginStore";
import { MAX_BITMAP_RENDERER_PATH_LENGTH } from "../../../src/types";
import type { RendererPluginManifest } from "../../../src/types";

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

  const manifest: RendererPluginManifest = {
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
    useRendererPluginStore.setState({ plugins: [manifest], errors: [], scanning: false, actionError: null });
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
    (window as any).terraForge.rendererPlugins.render.mockResolvedValue({ status: "ok", output: "M0 0 LNaN NaN" });

    await expect(materializeBitmapLayers(bitmap)).rejects.toThrow(/invalid path data/);
  });

  it("passes a well-formed path through untouched", async () => {
    (window as any).terraForge.rendererPlugins.render.mockResolvedValue({ status: "ok", output: "M0 0 L1 1" });

    await expect(materializeBitmapLayers(bitmap)).resolves.toMatchObject({
      bitmapRendererPath: "M0 0 L1 1",
      paths: [],
    });
  });

  it("stamps the output with the plugin's source version", async () => {
    useRendererPluginStore.setState({ plugins: [{ ...manifest, sourceHash: "abc123" }] });
    (window as any).terraForge.rendererPlugins.render.mockResolvedValue({ status: "ok", output: "M0 0 L1 1" });

    const result = await materializeBitmapLayers(bitmap);

    expect(result.rendererVersion).toBe("2/acme@plugin:abc123");
  });

  it("turns a plugin's dots into fillable paths tapped where the plugin said", async () => {
    (window as any).terraForge.rendererPlugins.render.mockResolvedValue({ status: "ok", output: {
      layers: [{ dots: [{ d: "M0 0 L2 0 L2 2 Z", x: 1.5, y: 0.5 }] }],
    } });

    const result = await materializeBitmapLayers(bitmap);

    expect(result.bitmapRendererPath).toBe("");
    expect(result.paths).toEqual([
      expect.objectContaining({ id: "bmp-dot-0", d: "M0 0 L2 0 L2 2 Z", hasFill: true, pointTap: { x: 1.5, y: 0.5 } }),
    ]);
  });

  it("keeps a layer's stroke and its dots as separate paths", async () => {
    (window as any).terraForge.rendererPlugins.render.mockResolvedValue({ status: "ok", output: {
      layers: [{ d: "M0 0 L5 5", dots: [{ d: "M1 1 L2 1 Z", x: 1, y: 1 }], label: "Ink" }],
    } });

    const { paths } = await materializeBitmapLayers(bitmap);

    expect(paths.map((path) => [path.id, path.hasFill])).toEqual([
      ["bmp-ink-0", false],
      ["bmp-dot-0", true],
    ]);
  });

  it("passes a renderer's warnings through", async () => {
    (window as any).terraForge.rendererPlugins.render.mockResolvedValue({ status: "ok", output: { layers: [{ d: "M0 0" }], warnings: ["Cut short"] } });

    expect((await materializeBitmapLayers(bitmap)).warnings).toEqual(["Cut short"]);
  });

  it("tells each separated render which ink it is, so it can offset its pattern", async () => {
    const render = (window as any).terraForge.rendererPlugins.render;
    render.mockClear();
    render.mockResolvedValue({ status: "ok", output: "M0 0 L1 1" });

    await materializeBitmapLayers({ ...bitmap, bitmapSeparationMode: "cmy" });

    expect(render.mock.calls.map(([, context]: [string, { ink: unknown }]) => context.ink)).toEqual([
      { index: 0, count: 3, label: "Cyan", color: "#00ffff", offset: true },
      { index: 1, count: 3, label: "Magenta", color: "#ff00ff", offset: true },
      { index: 2, count: 3, label: "Yellow", color: "#ffff00", offset: true },
    ]);
  });

  it("asks for one shared pattern when offsetting is turned off, and gives unseparated renders no ink", async () => {
    const render = (window as any).terraForge.rendererPlugins.render;
    render.mockClear();
    render.mockResolvedValue({ status: "ok", output: "M0 0 L1 1" });

    await materializeBitmapLayers({ ...bitmap, bitmapSeparationMode: "cmy", bitmapSeparationOffset: false });
    expect(render.mock.calls.every(([, context]: [string, { ink: { offset: boolean } }]) => context.ink.offset === false)).toBe(true);

    render.mockClear();
    await materializeBitmapLayers(bitmap);
    expect(render.mock.calls[0][1].ink).toBeUndefined();
  });

  it("separates for red, green and blue pens on white paper as three coloured inks", async () => {
    (window as any).terraForge.rendererPlugins.render.mockResolvedValue({ status: "ok", output: "M0 0 L1 1" });

    const { paths } = await materializeBitmapLayers({ ...bitmap, bitmapSeparationMode: "rgb-white" });

    expect(paths.map((path) => [path.label, path.strokeColor])).toEqual([
      ["Red", "#ff0000"],
      ["Green", "#00ff00"],
      ["Blue", "#0000ff"],
    ]);
  });

  it("names the ink a warning came from under colour separation, once per distinct warning", async () => {
    (window as any).terraForge.rendererPlugins.render.mockResolvedValue({ status: "ok", output: { layers: [{ d: "M0 0" }], warnings: ["Cut short"] } });

    const { warnings } = await materializeBitmapLayers({ ...bitmap, bitmapSeparationMode: "rgb" });

    expect(warnings).toEqual(["Red: Cut short", "Green: Cut short", "Blue: Cut short"]);
  });

  it("checks every ink channel when colour separation is active", async () => {
    (window as any).terraForge.rendererPlugins.render
      .mockResolvedValueOnce({ status: "ok", output: "M0 0 L1 1" })
      .mockResolvedValueOnce({ status: "ok", output: "M0 0 L1 1" })
      .mockResolvedValueOnce({ status: "ok", output: "M0 0 LInfinity 1" });

    await expect(
      materializeBitmapLayers({ ...bitmap, bitmapSeparationMode: "rgb" }),
    ).rejects.toThrow(/invalid path data/);
  });
});

describe("validateRendererOutput", () => {
  it("treats a bare path string as one unnamed layer", () => {
    expect(validateRendererOutput("M0 0 L1 1", "acme")).toEqual({
      layers: [{ d: "M0 0 L1 1", dots: [] }],
      warnings: [],
    });
  });

  it("accepts labelled, coloured layers for a renderer driving several pens", () => {
    const layers = [
      { d: "M0 0 L1 1", label: "Outline", color: "#ff0000" },
      { d: "M2 2 L3 3", label: "Fill" },
    ];
    expect(validateRendererOutput(layers, "acme").layers).toEqual([
      { d: "M0 0 L1 1", dots: [], label: "Outline", color: "#ff0000" },
      { d: "M2 2 L3 3", dots: [], label: "Fill", color: undefined },
    ]);
  });

  it("accepts the full { layers, warnings } form", () => {
    const result = validateRendererOutput({ layers: [{ d: "M0 0" }], warnings: ["Cut short"] }, "acme");
    expect(result).toEqual({ layers: [{ d: "M0 0", dots: [], label: undefined, color: undefined }], warnings: ["Cut short"] });
  });

  it("accepts a layer of dots only, each with its own tap point", () => {
    const dot = { d: "M0 0 L1 0 L1 1 Z", x: 0.5, y: 0.5 };
    expect(validateRendererOutput({ layers: [{ dots: [dot] }] }, "acme").layers).toEqual([
      { d: "", dots: [dot], label: undefined, color: undefined },
    ]);
  });

  it("checks the path data of every layer, not just the first", () => {
    expect(() =>
      validateRendererOutput([{ d: "M0 0" }, { d: "M0 0 LNaN 1" }], "acme"),
    ).toThrow(/invalid path data/);
  });

  it("checks every dot's outline and position", () => {
    expect(() => validateRendererOutput({ layers: [{ dots: [{ d: "MNaN 0 Z", x: 0, y: 0 }] }] }, "acme")).toThrow(
      /invalid path data/,
    );
    expect(() => validateRendererOutput({ layers: [{ dots: [{ d: "M0 0 Z", x: NaN, y: 0 }] }] }, "acme")).toThrow(
      /finite numeric x and y/,
    );
    expect(() => validateRendererOutput({ layers: [{ dots: "nope" }] }, "acme")).toThrow(/dots that are not an array/);
  });

  it("rejects a layer with neither path data nor dots", () => {
    expect(() => validateRendererOutput([{ label: "Outline" }], "acme")).toThrow(/neither a 'd' path nor dots/);
  });

  it("rejects layer metadata of the wrong type", () => {
    expect(() => validateRendererOutput([{ d: "M0 0", label: 7 }], "acme")).toThrow(
      /non-string label/,
    );
    expect(() => validateRendererOutput([{ d: "M0 0", color: {} }], "acme")).toThrow(
      /non-string color/,
    );
  });

  it("rejects warnings that are not strings, and keeps a few short ones", () => {
    expect(() => validateRendererOutput({ layers: [], warnings: [3] }, "acme")).toThrow(/warnings/);
    const many = validateRendererOutput({ layers: [], warnings: Array(20).fill("x".repeat(1000)) }, "acme").warnings;
    expect(many.length).toBeLessThanOrEqual(5);
    expect(many[0].length).toBeLessThanOrEqual(301);
  });

  it("rejects anything that is not a string, an array of layers, or { layers }", () => {
    expect(() => validateRendererOutput({ d: "M0 0" }, "acme")).toThrow(/expected a path string/);
    expect(() => validateRendererOutput(null, "acme")).toThrow(/returned null/);
  });
});
