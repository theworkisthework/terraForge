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
