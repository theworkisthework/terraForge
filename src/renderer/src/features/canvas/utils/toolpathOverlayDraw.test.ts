import { describe, expect, it, vi } from "vitest";
import { drawToolpathLayer } from "./toolpathOverlayDraw";
import type { GcodeToolpath } from "@renderer/utils/gcodeParser";

interface MockCtx {
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  setLineDash: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  strokeHistory: string[];
}

function makeMockCtx(): MockCtx {
  const ctx: MockCtx = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    strokeHistory: [],
  };
  ctx.stroke.mockImplementation(() => {
    ctx.strokeHistory.push(ctx.strokeStyle);
  });
  return ctx;
}

describe("drawToolpathLayer", () => {
  it("uses per-path and per-rapid color metadata when provided", () => {
    const ctx = makeMockCtx();
    const gcodeToolpath: GcodeToolpath = {
      cutPaths: [
        new Float32Array([0, 0, 10, 0]),
        new Float32Array([10, 0, 20, 0]),
      ],
      cutPathColors: ["#336699", "#663399"],
      rapidPaths: new Float32Array([20, 0, 25, 0, 25, 0, 30, 0]),
      rapidColors: ["#336699", "#663399"],
      bounds: { minX: 0, maxX: 30, minY: 0, maxY: 0 },
      lineCount: 4,
      fileSizeBytes: 64,
      totalCutDistance: 20,
      totalRapidDistance: 10,
      feedrate: 3000,
    };

    drawToolpathLayer({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      gcodeToolpath,
      toolpathSelected: false,
      toolpathOpacity: 1,
      plotProgressCuts: null,
      plotProgressRapids: null,
      ppCutsCache: { text: "", path: null },
      ppRapidsCache: { text: "", path: null },
      transform: { a: 1, d: 1, e: 0, f: 0, sx: 1 },
      physW: 1000,
      physH: 1000,
      vpZoom: 1,
      bedXMin: 0,
      bedXMax: 100,
      bedYMin: 0,
      bedYMax: 100,
    });

    // Cut colors should be used directly.
    expect(ctx.strokeHistory).toContain("#336699");
    expect(ctx.strokeHistory).toContain("#663399");

    // Rapid colors are lightened from cut colors (for 6-digit hex).
    expect(ctx.strokeHistory).toContain("#3b75b0");
    expect(ctx.strokeHistory).toContain("#753bb0");

    // Legacy defaults should not be necessary with full metadata present.
    expect(ctx.strokeHistory).not.toContain("#0ea5e9");
    expect(ctx.strokeHistory).not.toContain("#4a5568");
  });
});

describe("drawToolpathLayer pen colour", () => {
  const toolpath = {
    cutPaths: [new Float32Array([0, 0, 1, 1]), new Float32Array([2, 2, 3, 3])],
    cutPathColors: ["#ff0000", "#00ff00"],
    rapidPaths: new Float32Array(0),
    rapidColors: [],
  } as unknown as GcodeToolpath;
  const draw = (options: { useMetadataColors: boolean; penColor?: string | null; selected?: boolean }) => {
    const ctx = makeMockCtx();
    drawToolpathLayer({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      gcodeToolpath: toolpath,
      toolpathSelected: options.selected ?? false,
      useMetadataColors: options.useMetadataColors,
      penColor: options.penColor,
      toolpathOpacity: 1,
      plotProgressCuts: null,
      plotProgressRapids: null,
      ppCutsCache: { text: "", path: null },
      ppRapidsCache: { text: "", path: null },
      transform: { a: 1, d: 1, e: 0, f: 0, sx: 1 },
      physW: 100,
      physH: 100,
      vpZoom: 1,
      bedXMin: 0,
      bedXMax: 100,
      bedYMin: 0,
      bedYMax: 100,
    });
    return [...new Set(ctx.strokeHistory)];
  };

  it("draws every cut in the page's pen when not coloured by source", () => {
    expect(draw({ useMetadataColors: false, penColor: "#202020" })).toEqual(["#202020"]);
    expect(draw({ useMetadataColors: false, penColor: "#202020", selected: true })).not.toEqual(["#202020"]);
  });

  it("keeps the default cyan without a page, and source colours when asked for", () => {
    expect(draw({ useMetadataColors: false })).toEqual(["#0ea5e9"]);
    expect(draw({ useMetadataColors: true, penColor: "#202020" })).toEqual(["#ff0000", "#00ff00"]);
  });
});

describe("drawToolpathLayer plot progress", () => {
  const base = {
    gcodeToolpath: { cutPaths: [], rapidPaths: new Float32Array(0) } as unknown as GcodeToolpath,
    toolpathSelected: false,
    toolpathOpacity: 1,
    transform: { a: 1, d: 1, e: 0, f: 0, sx: 1 },
    physW: 100,
    physH: 100,
    vpZoom: 1,
    bedXMin: 0,
    bedXMax: 100,
    bedYMin: 0,
    bedYMax: 100,
  };

  it("draws completed cuts and rapids, reusing each Path2D until its text changes", () => {
    const built: string[] = [];
    vi.stubGlobal(
      "Path2D",
      class {
        constructor(d: string) {
          built.push(d);
        }
      },
    );
    const ppCutsCache = { text: "", path: null };
    const ppRapidsCache = { text: "", path: null };
    const draw = (cuts: string) => {
      const ctx = { ...makeMockCtx(), shadowBlur: 0, shadowColor: "" };
      drawToolpathLayer({ ...base, ctx: ctx as unknown as CanvasRenderingContext2D, plotProgressCuts: cuts, plotProgressRapids: "M0 0 L5 5", ppCutsCache, ppRapidsCache });
      return ctx.stroke.mock.calls.length;
    };
    expect(draw("M0 0 L1 1")).toBeGreaterThanOrEqual(2);
    draw("M0 0 L1 1");
    draw("M0 0 L2 2");
    expect(built).toEqual(["M0 0 L5 5", "M0 0 L1 1", "M0 0 L2 2"]);
    vi.unstubAllGlobals();
  });

  it("skips progress whose path data the canvas rejects", () => {
    vi.stubGlobal(
      "Path2D",
      class {
        constructor() {
          throw new Error("bad path");
        }
      },
    );
    const ctx = makeMockCtx();
    const ppCutsCache = { text: "", path: null };
    drawToolpathLayer({ ...base, ctx: ctx as unknown as CanvasRenderingContext2D, plotProgressCuts: "nonsense", plotProgressRapids: null, ppCutsCache, ppRapidsCache: { text: "", path: null } });
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ppCutsCache).toEqual({ text: "nonsense", path: null });
    vi.unstubAllGlobals();
  });
});
