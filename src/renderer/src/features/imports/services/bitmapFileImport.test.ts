import { describe, expect, it, vi } from "vitest";

const loadBitmapForImport = vi.fn();
const materializeBitmapLayers = vi.fn();
vi.mock("../../bitmap-renderers/bitmapImage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadBitmapForImport: (...args: unknown[]) => loadBitmapForImport(...args),
  materializeBitmapLayers: (...args: unknown[]) => materializeBitmapLayers(...args),
}));

import { bitmapMimeType, buildBitmapImport } from "./bitmapFileImport";
import { createMachineConfig } from "../../../../../../tests/helpers/factories";

function stubImage(rendered: { warnings?: string[] } = {}) {
  loadBitmapForImport.mockImplementation(async (_bytes, _mime, fitScale: (w: number, h: number) => number) => {
    const baseScale = fitScale(400, 200);
    return { dataUrl: "data:image/png;base64,AA", width: 400, height: 200, baseScale };
  });
  materializeBitmapLayers.mockResolvedValue({ bitmapRendererPath: "M0 0", paths: [], rendererVersion: "v1", ...rendered });
}

const build = (origin: string, rendered?: { warnings?: string[] }) => {
  stubImage(rendered);
  return buildBitmapImport(new Uint8Array([1]), "photo", "image/png", {
    machine: createMachineConfig({ origin: origin as never, bedWidth: 300, bedHeight: 200 }),
    pageTemplate: null,
    pageSizes: [],
    currentPage: null,
  });
};

describe("bitmapMimeType", () => {
  it("names JPEG and WebP, and treats anything else as PNG", () => {
    expect(bitmapMimeType("/a/b.JPG")).toBe("image/jpeg");
    expect(bitmapMimeType("x.jpeg")).toBe("image/jpeg");
    expect(bitmapMimeType("x.webp")).toBe("image/webp");
    expect(bitmapMimeType("x.png")).toBe("image/png");
  });
});

describe("buildBitmapImport", () => {
  it("renders with the default renderer at the fitted scale and stamps the render", async () => {
    const imp = await build("bottom-left");
    expect(imp).toMatchObject({
      kind: "bitmap",
      name: "photo",
      svgWidth: 400,
      svgHeight: 200,
      bitmapRendererPath: "M0 0",
      bitmapRendererVersion: "v1",
      bitmapMimeType: "image/png",
      x: 0,
      y: 0,
    });
    expect(imp.bitmapBaseScale).toBe(imp.scale);
    expect(imp.bitmapRenderSignature).toBeTruthy();
    expect(imp.bitmapRenderWarnings).toBeUndefined();
  });

  it("places the image against the machine origin's corner", async () => {
    const imp = await build("top-right");
    expect(imp.x).toBeCloseTo(300 - 400 * imp.scale, 9);
    expect(imp.y).toBeCloseTo(-200 * imp.scale, 9);
  });

  it("keeps the renderer's warnings", async () => {
    expect((await build("bottom-left", { warnings: ["capped"] })).bitmapRenderWarnings).toEqual(["capped"]);
  });
});
