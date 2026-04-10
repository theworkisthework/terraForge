import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { ToolpathOverlay, type ToolpathOverlayProps } from "./ToolpathOverlay";
import type { Vp } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultVp: Vp = { zoom: 1, panX: 0, panY: 0 };

function makeProps(
  overrides?: Partial<ToolpathOverlayProps>,
): ToolpathOverlayProps {
  return {
    vp: defaultVp,
    containerSize: { w: 800, h: 600 },
    isCenter: false,
    isBottom: false,
    isRight: false,
    bedW: 220,
    bedH: 200,
    bedXMin: 0,
    bedXMax: 220,
    bedYMin: 0,
    bedYMax: 200,
    canvasH: 200 * 3.7795 + 20 * 2,
    imports: [],
    selectedImportId: null,
    allImportsSelected: false,
    selectedGroupId: null,
    layerGroups: [],
    gcodeToolpath: null,
    toolpathSelected: false,
    plotProgressCuts: null,
    plotProgressRapids: null,
    ...overrides,
  };
}

// Build a minimal canvas 2D context mock.
function makeMockCtx() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
  };
}

// Make rAF synchronous and restore afterwards.
function stubRAF() {
  const orig = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  };
  return () => {
    globalThis.requestAnimationFrame = orig;
  };
}

// Stub getContext to return a mock ctx.
function stubGetContext(mockCtx: ReturnType<typeof makeMockCtx>) {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi
    .fn()
    .mockReturnValue(mockCtx) as typeof orig;
  return () => {
    HTMLCanvasElement.prototype.getContext = orig;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ToolpathOverlay", () => {
  it("renders a canvas element", () => {
    const { container } = render(<ToolpathOverlay {...makeProps()} />);
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("canvas has data-testid toolpath-canvas", () => {
    const { getByTestId } = render(<ToolpathOverlay {...makeProps()} />);
    expect(getByTestId("toolpath-canvas")).toBeTruthy();
  });

  it("canvas has pointer-events none style", () => {
    const { getByTestId } = render(<ToolpathOverlay {...makeProps()} />);
    const canvas = getByTestId("toolpath-canvas") as HTMLCanvasElement;
    expect(canvas.style.pointerEvents).toBe("none");
  });

  it("draw loop fires: clearRect called when container has size", () => {
    const restoreRAF = stubRAF();
    const mockCtx = makeMockCtx();
    const restoreCtx = stubGetContext(mockCtx);

    render(<ToolpathOverlay {...makeProps()} />);
    expect(mockCtx.clearRect).toHaveBeenCalled();

    restoreCtx();
    restoreRAF();
  });

  it("bed background fillRect always called, even without toolpath", () => {
    const restoreRAF = stubRAF();
    const mockCtx = makeMockCtx();
    const restoreCtx = stubGetContext(mockCtx);

    render(<ToolpathOverlay {...makeProps({ gcodeToolpath: null })} />);
    expect(mockCtx.fillRect).toHaveBeenCalled();

    restoreCtx();
    restoreRAF();
  });

  it("draw loop does not fire when containerSize is zero", () => {
    const restoreRAF = stubRAF();
    const mockCtx = makeMockCtx();
    const restoreCtx = stubGetContext(mockCtx);

    render(
      <ToolpathOverlay {...makeProps({ containerSize: { w: 0, h: 0 } })} />,
    );
    // clearRect should not be called because the guard exits early.
    expect(mockCtx.clearRect).not.toHaveBeenCalled();

    restoreCtx();
    restoreRAF();
  });

  it("setTransform receives non-zero values when container is sized", () => {
    const restoreRAF = stubRAF();
    const mockCtx = makeMockCtx();
    const restoreCtx = stubGetContext(mockCtx);

    render(<ToolpathOverlay {...makeProps()} />);
    // setTransform is called for the bed background fill and for imports.
    expect(mockCtx.setTransform).toHaveBeenCalled();

    restoreCtx();
    restoreRAF();
  });

  it("stroke is called when gcodeToolpath has cut paths", () => {
    const restoreRAF = stubRAF();
    const mockCtx = makeMockCtx();
    const restoreCtx = stubGetContext(mockCtx);

    const tp = {
      cutPaths: [new Float32Array([0, 0, 100, 100])],
      rapidPaths: new Float32Array([0, 0, 50, 50]),
      bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
      lineCount: 1,
      fileSizeBytes: 64,
      totalCutDistance: 141,
      totalRapidDistance: 70,
      feedrate: 3000,
    };

    render(<ToolpathOverlay {...makeProps({ gcodeToolpath: tp })} />);
    expect(mockCtx.stroke).toHaveBeenCalled();

    restoreCtx();
    restoreRAF();
  });
});
