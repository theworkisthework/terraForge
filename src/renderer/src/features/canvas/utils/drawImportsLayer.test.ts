import { describe, expect, it, vi } from "vitest";
import { drawImportsLayer } from "./toolpathOverlayDraw";
import type { SvgImport } from "../../../../../types";

function makeMockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    lineWidth: 1,
  };
}

function makeBaseImport(overrides?: Partial<SvgImport>): SvgImport {
  return {
    id: "imp-1",
    name: "imp",
    paths: [],
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 10,
    svgHeight: 10,
    viewBoxX: 0,
    viewBoxY: 0,
    ...overrides,
  };
}

describe("drawImportsLayer", () => {
  it("skips a bitmap import's paths entirely, even when colour separation populated them", () => {
    const ctx = makeMockCtx();
    const bitmapImport = makeBaseImport({
      kind: "bitmap",
      paths: [
        { id: "ink-0", d: "M0 0 L1 1", svgSource: "", visible: true, strokeColor: "#00ffff" },
        { id: "ink-1", d: "M2 2 L3 3", svgSource: "", visible: true, strokeColor: "#ff00ff" },
      ],
    });

    drawImportsLayer({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      dpr: 1,
      vp: { zoom: 1, panX: 0, panY: 0 },
      imports: [bitmapImport],
      layerGroups: [],
      selectedImportId: null,
      allImportsSelected: false,
      selectedGroupId: null,
      isBottom: true,
      canvasH: 1000,
      respectSvgColorsOnCanvas: true,
      cache: new Map(),
    });

    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("still draws a regular (non-bitmap) SVG import's paths", () => {
    const ctx = makeMockCtx();
    const svgImport = makeBaseImport({
      paths: [{ id: "p1", d: "M0 0 L1 1", svgSource: "", visible: true, strokeColor: "#123456" }],
    });

    drawImportsLayer({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      dpr: 1,
      vp: { zoom: 1, panX: 0, panY: 0 },
      imports: [svgImport],
      layerGroups: [],
      selectedImportId: null,
      allImportsSelected: false,
      selectedGroupId: null,
      isBottom: true,
      canvasH: 1000,
      respectSvgColorsOnCanvas: true,
      cache: new Map(),
    });

    expect(ctx.stroke).toHaveBeenCalled();
  });
});
