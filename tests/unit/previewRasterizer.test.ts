import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BitmapPreviewRasterizer } from "@renderer/features/canvas/bitmapPreview/previewRasterizer";
import type { RasterRequest, RasterWorkerRequest } from "@renderer/features/canvas/bitmapPreview/rasterProtocol";
import type { SvgImport } from "@types/index";

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
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false, 1);

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
    rasterizer.draw(ctx, bitmapImport(), false, 1);
    rasterizer.draw(ctx, bitmapImport(), false, 1);

    expect(rasters()).toHaveLength(1);
  });

  it("draws a finished image over the import's own bounds, and asks for a redraw", () => {
    const listener = vi.fn();
    rasterizer.subscribe(listener);
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false, 1);
    const [request] = rasters();
    const bitmap = FakeWorker.last!.reply(request.id, request.slot);

    expect(listener).toHaveBeenCalled();
    const ctx = fakeContext(0.1);
    rasterizer.draw(ctx, bitmapImport(), false, 1);
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 4000, 3000);
  });

  it("waits for a zoom to settle before asking for a sharper image, then asks for just the visible part", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false, 1);
    const [first] = rasters();
    FakeWorker.last!.reply(first.id, first.slot);

    // Zoomed in well past the overview's size cap.
    const zoomed = fakeContext(4, -2000);
    rasterizer.draw(zoomed, bitmapImport(), false, 1);
    expect(rasters()).toHaveLength(1);

    rasterizer.draw(zoomed, bitmapImport(), false, 1); // still moving
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
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false, 1);
    rasterizer.draw(fakeContext(0.1), bitmapImport({ bitmapRendererPath: "M5 5 L6 6" }), false, 1);

    const [, second] = rasters();
    expect(second.layers).toEqual([{ d: "M5 5 L6 6", color: null }]);
    expect(second.geometryKey).not.toBe(rasters()[0].geometryKey);
    expect(FakeWorker.last!.posted).toContainEqual({ type: "drop", prefix: rasters()[0].geometryKey });
  });

  it("re-tints rather than re-draws when only the selection colour changes", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false, 1);
    const [request] = rasters();
    FakeWorker.last!.reply(request.id, request.slot);

    rasterizer.draw(fakeContext(0.1), bitmapImport(), true, 1);

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
    rasterizer.draw(fakeContext(0.1), imp, false, 1);

    expect(rasters()[0]).toMatchObject({ mask: false, blend: "darken", layers: [{ d: "M0 0 L1 1", color: "#00ffff" }] });
  });

  it("throws away a reply that a newer request has superseded", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false, 1);
    const [old] = rasters();
    rasterizer.draw(fakeContext(0.1), bitmapImport({ bitmapRendererPath: "M5 5" }), false, 1);

    const stale = FakeWorker.last!.reply(old.id, old.slot);

    expect(stale.close).toHaveBeenCalled();
    const ctx = fakeContext(0.1);
    rasterizer.draw(ctx, bitmapImport({ bitmapRendererPath: "M5 5" }), false, 1);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("frees an import's images and worker state once it is gone", () => {
    rasterizer.draw(fakeContext(0.1), bitmapImport(), false, 1);
    const [request] = rasters();
    const bitmap = FakeWorker.last!.reply(request.id, request.slot);

    rasterizer.prune(new Set());

    expect(bitmap.close).toHaveBeenCalled();
    expect(FakeWorker.last!.posted).toContainEqual({ type: "drop", prefix: "bmp#" });
    expect(FakeWorker.last!.posted).toContainEqual({ type: "drop", prefix: "bmp:" });
  });

  it("draws nothing, and asks for nothing, while the preview is hidden", () => {
    const ctx = fakeContext(0.1);
    rasterizer.draw(ctx, bitmapImport({ bitmapPreviewVisible: false }), false, 1);

    expect(FakeWorker.last).toBeUndefined();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
