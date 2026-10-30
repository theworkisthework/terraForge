import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BitmapPreviewRasterizer } from "@renderer/features/canvas/bitmapPreview/previewRasterizer";
import type { RasterRequest, RasterWorkerRequest } from "@renderer/features/canvas/bitmapPreview/rasterProtocol";
import type { SvgImport } from "../../src/types";

/** Just enough of DOMMatrix for an axis-aligned scale + translate. */
class Matrix {
  constructor(
    public a: number,
    public d: number,
    public e: number,
    public f: number,
    public b = 0,
    public c = 0,
  ) {}
  inverse() {
    return new Matrix(1 / this.a, 1 / this.d, -this.e / this.a, -this.f / this.d);
  }
  transformPoint({ x, y }: { x: number; y: number }) {
    return { x: this.a * x + this.e, y: this.d * y + this.f };
  }
}

class FakeWorker {
  static last: FakeWorker | undefined;
  posted: RasterWorkerRequest[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: RasterWorkerRequest) {
    this.posted.push(message);
  }
  reply(id: number, slot: string, bitmap = fakeBitmap()) {
    this.onmessage?.({ data: { id, slot, bitmap } });
    return bitmap;
  }
}

const fakeBitmap = () => ({ close: vi.fn(), width: 1, height: 1 }) as unknown as ImageBitmap;

/** A 2D context stand-in whose transform maps local units to device pixels. */
function fakeContext(scale: number, offset = 0) {
  return {
    canvas: { width: 1000, height: 800 },
    getTransform: () => new Matrix(scale, scale, offset, offset),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    imageSmoothingEnabled: false,
  } as unknown as CanvasRenderingContext2D & { drawImage: ReturnType<typeof vi.fn> };
}

function bitmapImport(overrides: Partial<SvgImport> = {}): SvgImport {
  return {
    id: "bmp",
    name: "photo",
    kind: "bitmap",
    paths: [],
    x: 0,
    y: 0,
    scale: 1,
    visible: true,
    svgWidth: 4000,
    svgHeight: 3000,
    bitmapRendererPath: "M0 0 L10 10",
    bitmapSourceVisible: false,
    ...overrides,
  } as SvgImport;
}

const rasters = () => FakeWorker.last!.posted.filter((m): m is RasterRequest => m.type === "raster");

let rasterizer: BitmapPreviewRasterizer;

beforeEach(() => {
  FakeWorker.last = undefined;
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("Path2D", class { rect() {} });
  rasterizer = new BitmapPreviewRasterizer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BitmapPreviewRasterizer", () => {
  it("asks for an overview of the whole import straight away, as a tintable mask", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false);

    const [request] = rasters();
    expect(request).toMatchObject({
      slot: "bmp:overview",
      region: { x: 0, y: 0, w: 4000, h: 3000 },
      scale: 0.1,
      mask: true,
      layers: [{ d: "M0 0 L10 10", color: null }],
    });
  });

  it("does not ask again for an image already on its way", () => {
    const ctx = fakeContext(0.1);
    rasterizer.draw(ctx, bitmapImport(), false);
    rasterizer.draw(ctx, bitmapImport(), false);

    expect(rasters()).toHaveLength(1);
  });

  it("draws a finished image over the import's own bounds, and asks for a redraw", () => {
    const listener = vi.fn();
    rasterizer.subscribe(listener);
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false);
    const [request] = rasters();
    const bitmap = FakeWorker.last!.reply(request.id, request.slot);

    expect(listener).toHaveBeenCalled();
    const ctx = fakeContext(0.1);
    rasterizer.draw(ctx, bitmapImport(), false);
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 4000, 3000);
  });

  it("waits for a zoom to settle before asking for a sharper image, then asks for just the visible part", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false);
    const [first] = rasters();
    FakeWorker.last!.reply(first.id, first.slot);

    // Zoomed in well past the overview's size cap.
    const zoomed = fakeContext(4, -2000);
    rasterizer.draw(zoomed, bitmapImport(), false);
    expect(rasters()).toHaveLength(1);

    rasterizer.draw(zoomed, bitmapImport(), false); // still moving
    vi.advanceTimersByTime(119);
    expect(rasters()).toHaveLength(1);

    vi.advanceTimersByTime(10);
    const detail = rasters().find((request) => request.slot === "bmp:detail")!;
    expect(detail.scale).toBe(4);
    // The visible region (500..750 by 500..700) plus a margin, never the whole import.
    expect(detail.region.x).toBeLessThanOrEqual(500);
    expect(detail.region.x + detail.region.w).toBeGreaterThanOrEqual(750);
    expect(detail.region.w).toBeLessThan(4000);
    // Geometry the worker already holds is not sent again.
    expect(detail.layers).toBeUndefined();
  });

  it("asks for a new overview straight away when the render changes, sending the new geometry", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false);
    rasterizer.draw(fakeContext(0.1), bitmapImport({ bitmapRendererPath: "M5 5 L6 6" }), false);

    const [, second] = rasters();
    expect(second.layers).toEqual([{ d: "M5 5 L6 6", color: null }]);
    expect(second.geometryKey).not.toBe(rasters()[0].geometryKey);
    expect(FakeWorker.last!.posted).toContainEqual({ type: "drop", prefix: rasters()[0].geometryKey });
  });

  it("re-tints rather than re-draws when only the selection colour changes", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false);
    const [request] = rasters();
    FakeWorker.last!.reply(request.id, request.slot);

    rasterizer.draw(fakeContext(0.1), bitmapImport(), true);

    expect(rasters()).toHaveLength(1);
    expect(FakeWorker.last!.posted.at(-1)).toMatchObject({ type: "tint", slot: "bmp:overview", color: "#60a0ff" });
  });

  it("draws separated inks in their own colours with darken, not as a mask", () => {
    const imp = bitmapImport({
      bitmapRendererPath: "",
      paths: [
        { id: "c", d: "M0 0 L1 1", strokeColor: "#00ffff", visible: true } as SvgImport["paths"][number],
        { id: "m", d: "M2 2 L3 3", strokeColor: "#ff00ff", visible: false } as SvgImport["paths"][number],
      ],
    });
    rasterizer.draw(fakeContext(0.1), imp, false);

    expect(rasters()[0]).toMatchObject({ mask: false, blend: "darken", layers: [{ d: "M0 0 L1 1", color: "#00ffff" }] });
  });

  it("sends each run of one ink's paths as a single layer, so a halftone's dots are not stroked one by one", () => {
    const path = (id: string, d: string, strokeColor: string) =>
      ({ id, d, strokeColor, visible: true }) as SvgImport["paths"][number];
    const imp = bitmapImport({
      bitmapRendererPath: "",
      paths: [path("c1", "M0 0 L1 1", "#00ffff"), path("c2", "M2 2 L3 3", "#00ffff"), path("m1", "M4 4 L5 5", "#ff00ff")],
    });
    rasterizer.draw(fakeContext(0.1), imp, false);

    expect(rasters()[0].layers).toEqual([
      { d: "M0 0 L1 1 M2 2 L3 3", color: "#00ffff" },
      { d: "M4 4 L5 5", color: "#ff00ff" },
    ]);
  });

  it("draws strokes at the pen's real width, so zoomed out shows the plot's true coverage", () => {
    // 0.25 mm per source pixel; a 0.5 mm pen is 2 source pixels wide whatever the zoom.
    rasterizer.draw(fakeContext(0.1), bitmapImport({ scale: 0.25, strokeWidthMM: 0.5 }), false);
    rasterizer.draw(fakeContext(4), bitmapImport({ id: "b2", scale: 0.25, strokeWidthMM: 0.5 }), false);

    for (const request of rasters()) expect(request.lineWidth).toBeCloseTo(2, 10);
  });

  it("tints a single-colour preview with the page's pen, shaded when selected", () => {
    const page = { paper: "#ffffff", pen: "#204080" };
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false, page);
    const [request] = rasters();
    expect(request.color).toBe("#204080");
    FakeWorker.last!.reply(request.id, request.slot);

    rasterizer.draw(fakeContext(0.1), bitmapImport(), true, page);
    const tint = FakeWorker.last!.posted.at(-1) as { type: string; color: string };
    expect(tint.type).toBe("tint");
    expect(tint.color).not.toBe("#204080");
  });

  it("supersamples, so fine screens do not alias into bands", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false);
    expect(rasters()[0].supersample).toBeGreaterThan(1);
  });

  describe("separated inks", () => {
    const inks = (mode: SvgImport["bitmapSeparationMode"]) =>
      bitmapImport({
        bitmapRendererPath: "",
        bitmapSeparationMode: mode,
        paths: [
          { id: "c", d: "M0 0 L1 1", strokeColor: "#00ffff", visible: true } as SvgImport["paths"][number],
          { id: "m", d: "M2 2 L3 3", strokeColor: "#ff00ff", visible: true } as SvgImport["paths"][number],
        ],
      });

    it("multiplies inks onto white paper for subtractive modes", () => {
      for (const mode of ["cmy", "cmyk", "rgb-white", "custom"] as const) {
        rasterizer = new BitmapPreviewRasterizer();
        rasterizer.draw(fakeContext(0.1), inks(mode), false);
        expect(rasters().at(-1), mode).toMatchObject({ paper: "#ffffff", blend: "multiply" });
      }
    });

    it("screens light inks onto black paper", () => {
      rasterizer.draw(fakeContext(0.1), inks("rgb"), false);
      expect(rasters()[0]).toMatchObject({ paper: "#000000", blend: "screen" });
    });

    it("draws on the page's paper when a page is shown, screening onto dark paper", () => {
      rasterizer.draw(fakeContext(0.1), inks("cmyk"), false, { paper: "#f3ecd8", pen: "#000000" });
      rasterizer.draw(fakeContext(0.1), inks("cmyk"), false, { paper: "#141414", pen: "#ffffff" });
      expect(rasters().map(({ paper, blend }) => [paper, blend])).toEqual([
        ["#f3ecd8", "multiply"],
        ["#141414", "screen"],
      ]);
    });

    it("redraws when the separation mode changes the paper", () => {
      rasterizer.draw(fakeContext(0.1), inks("cmyk"), false);
      rasterizer.draw(fakeContext(0.1), inks("rgb"), false);
      expect(rasters().map((request) => request.paper)).toEqual(["#ffffff", "#000000"]);
    });
  });

  it("throws away a reply that a newer request has superseded", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false);
    const [old] = rasters();
    rasterizer.draw(fakeContext(0.1), bitmapImport({ bitmapRendererPath: "M5 5" }), false);

    const stale = FakeWorker.last!.reply(old.id, old.slot);

    expect(stale.close).toHaveBeenCalled();
    const ctx = fakeContext(0.1);
    rasterizer.draw(ctx, bitmapImport({ bitmapRendererPath: "M5 5" }), false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("frees an import's images and worker state once it is gone", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false);
    const [request] = rasters();
    const bitmap = FakeWorker.last!.reply(request.id, request.slot);

    rasterizer.prune(new Set());

    expect(bitmap.close).toHaveBeenCalled();
    expect(FakeWorker.last!.posted).toContainEqual({ type: "drop", prefix: "bmp#" });
    expect(FakeWorker.last!.posted).toContainEqual({ type: "drop", prefix: "bmp:" });
  });

  it("draws nothing, and asks for nothing, while the preview is hidden", () => {
    const ctx = fakeContext(0.1);
    rasterizer.draw(ctx, bitmapImport({ bitmapPreviewVisible: false }), false);

    expect(FakeWorker.last).toBeUndefined();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
