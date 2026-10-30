import { describe, expect, it, vi } from "vitest";
import { drawImportsLayer } from "./toolpathOverlayDraw";
import type { SvgImport } from "../../../../../types";

function makeMockCtx() {
  return {
    fillRect: vi.fn(),
    fillStyle: "",
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

  describe("on a page", () => {
    const page = { paper: "#f3ecd8", pen: "#202020", rect: { x: 10, y: 20, w: 300, h: 200 } };
    const draw = (imports: SvgImport[], options: { selected?: string | null; respect?: boolean } = {}) => {
      const ctx = { ...makeMockCtx(), fillRect: vi.fn(), fillStyle: "", strokes: [] as [string, number][] };
      ctx.stroke.mockImplementation(() => ctx.strokes.push([ctx.strokeStyle, ctx.lineWidth]));
      drawImportsLayer({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        dpr: 1,
        vp: { zoom: 1, panX: 0, panY: 0 },
        imports,
        layerGroups: [],
        selectedImportId: options.selected ?? null,
        allImportsSelected: false,
        selectedGroupId: null,
        isBottom: true,
        canvasH: 1000,
        respectSvgColorsOnCanvas: options.respect ?? false,
        cache: new Map(),
        page,
      });
      return ctx;
    };

    it("fills the page with its paper colour beneath the imports", () => {
      const ctx = draw([makeBaseImport({ paths: [{ id: "p", d: "M0 0 L1 1", svgSource: "", visible: true }] })]);
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 300, 200);
      expect(ctx.fillStyle).toBe("#f3ecd8");
      expect(ctx.fillRect.mock.invocationCallOrder[0]).toBeLessThan(ctx.stroke.mock.invocationCallOrder[0]);
    });

    it("draws paths in the page's pen, shaded when selected", () => {
      const imp = makeBaseImport({ paths: [{ id: "p", d: "M0 0 L1 1", svgSource: "", visible: true }] });
      expect(draw([imp]).strokes[0][0]).toBe("#202020");
      const selected = draw([imp], { selected: imp.id }).strokes[0][0];
      expect(selected).not.toBe("#202020");
      expect(parseInt(selected.slice(1, 3), 16)).toBeGreaterThan(0x20); // lighter, for a dark pen
    });

    it("keeps a path's own colour when SVG colours are respected", () => {
      const imp = makeBaseImport({ paths: [{ id: "p", d: "M0 0 L1 1", svgSource: "", visible: true, strokeColor: "#123456" }] });
      expect(draw([imp], { respect: true }).strokes[0][0]).toBe("#123456");
    });

    it("strokes at the pen's real width, whatever the zoom", () => {
      // 0.25 mm per local unit and a 0.5 mm pen: 2 local units.
      const imp = makeBaseImport({ scale: 0.25, strokeWidthMM: 0.5, paths: [{ id: "p", d: "M0 0 L1 1", svgSource: "", visible: true }] });
      expect(draw([imp]).strokes[0][1]).toBe(2);
    });
  });

  it("fills no paper and uses the default blues without a page", () => {
    const ctx = { ...makeMockCtx(), fillRect: vi.fn() };
    const strokes: string[] = [];
    ctx.stroke.mockImplementation(() => strokes.push(ctx.strokeStyle));
    drawImportsLayer({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      dpr: 1,
      vp: { zoom: 1, panX: 0, panY: 0 },
      imports: [makeBaseImport({ paths: [{ id: "p", d: "M0 0 L1 1", svgSource: "", visible: true }] })],
      layerGroups: [],
      selectedImportId: null,
      allImportsSelected: false,
      selectedGroupId: null,
      isBottom: true,
      canvasH: 1000,
      respectSvgColorsOnCanvas: false,
      cache: new Map(),
    });
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(strokes[0]).toBe("#3a6aaa");
  });

  describe("paths and colours", () => {
    /** Draws and returns [strokeStyle, path data] for each stroke. */
    const strokes = (imports: SvgImport[], extra: Partial<Parameters<typeof drawImportsLayer>[0]> = {}) => {
      const made = new Map<object, string>();
      vi.stubGlobal(
        "Path2D",
        class {
          constructor(d?: string) {
            made.set(this, d ?? "");
          }
        },
      );
      const ctx = makeMockCtx();
      const out: [string, string][] = [];
      ctx.stroke.mockImplementation((path: object) => out.push([ctx.strokeStyle, made.get(path) ?? ""]));
      drawImportsLayer({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        dpr: 1,
        vp: { zoom: 1, panX: 0, panY: 0 },
        imports,
        layerGroups: [],
        selectedImportId: null,
        allImportsSelected: false,
        selectedGroupId: null,
        isBottom: true,
        canvasH: 1000,
        respectSvgColorsOnCanvas: false,
        cache: new Map(),
        ...extra,
      });
      vi.unstubAllGlobals();
      return out;
    };
    const path = (id: string, extra: Partial<SvgImport["paths"][number]> = {}) =>
      ({ id, d: `M${id}`, svgSource: "", visible: true, ...extra }) as SvgImport["paths"][number];

    it("leaves out paths on hidden layers, and hidden paths", () => {
      const imp = makeBaseImport({
        layers: [
          { id: "shown", name: "Shown", visible: true },
          { id: "hidden", name: "Hidden", visible: false },
        ] as SvgImport["layers"],
        paths: [path("1", { layer: "shown" }), path("2", { layer: "hidden" }), path("3", { visible: false })],
      });
      expect(strokes([imp])[0][1]).toBe("M1");
    });

    it("draws a grouped import in its group's colour, brighter when the group is selected", () => {
      const imp = makeBaseImport({ paths: [path("1")] });
      const group = { id: "g", name: "G", color: "#204060", importIds: [imp.id] };
      expect(strokes([imp], { layerGroups: [group] })[0][0]).toBe("#204060");
      expect(strokes([imp], { layerGroups: [group], selectedGroupId: "g" })[0][0]).not.toBe("#204060");
    });

    it("draws hatching beside outlines, each by its own colour when SVG colours are shown", () => {
      const imp = makeBaseImport({
        paths: [path("1", { strokeColor: "#111111", fillColor: "#222222", hatchLines: ["M9 9 L10 10"] })],
      });
      expect(strokes([imp], { respectSvgColorsOnCanvas: true })).toEqual([
        ["#111111", "M1"],
        ["#222222", "M9 9 L10 10"],
      ]);
    });

    it("hands a bitmap to the preview rasterizer, with the page's paper and pen", () => {
      const draw = vi.fn();
      const bitmapPreviews = { draw, prune: vi.fn() } as never;
      const bitmap = makeBaseImport({ kind: "bitmap" });
      const page = { paper: "#ffffff", pen: "#000000", rect: { x: 0, y: 0, w: 1, h: 1 } };
      strokes([bitmap], { bitmapPreviews, page, selectedImportId: bitmap.id });
      expect(draw).toHaveBeenCalledWith(expect.anything(), bitmap, true, { paper: "#ffffff", pen: "#000000" });
    });
  });
});
