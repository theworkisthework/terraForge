import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewport } from "./useViewport";
import { MIN_ZOOM } from "../constants";

// ── ResizeObserver mock ───────────────────────────────────────────────────────
// Replace the global with a class stub so `new ResizeObserver(cb)` works.

type ROMock = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};
let capturedROCallbacks: ResizeObserverCallback[] = [];
let roMocks: ROMock[] = [];

beforeEach(() => {
  capturedROCallbacks = [];
  roMocks = [];
  vi.stubGlobal(
    "ResizeObserver",
    class MockRO {
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      unobserve = vi.fn();
      constructor(cb: ResizeObserverCallback) {
        capturedROCallbacks.push(cb);
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        roMocks.push({ observe: this.observe, disconnect: this.disconnect });
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fire a fake ResizeObserver entry on the last registered callback. */
function fireResize(width: number, height: number, index = 0) {
  const cb = capturedROCallbacks[index];
  if (!cb) throw new Error("No ResizeObserver callback captured");
  act(() => {
    cb(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      null as unknown as ResizeObserver,
    );
  });
}

/** Make a minimal containerRef pointing at a div with a known bounding rect. */
function makeContainerRef(width = 800, height = 600) {
  const div = document.createElement("div");
  div.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    }) as DOMRect;
  return { current: div };
}

// ── canvasW / canvasH for tests ───────────────────────────────────────────────
// Choose values that produce predictable zoom: canvasW=200, canvasH=150
const CANVAS_W = 200;
const CANVAS_H = 150;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useViewport", () => {
  describe("computeFit", () => {
    it("returns zoom that fits canvas inside container", () => {
      const ref = makeContainerRef();
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));
      // For container 800×600, canvas 200×150:
      // zoom = min((800-16)/200, (600-16)/150) = min(3.92, 3.89) ≈ 3.89
      const vp = result.current.computeFit(800, 600);
      expect(vp.zoom).toBeCloseTo(3.89, 1);
      expect(vp.panX).toBeGreaterThan(0); // centred horizontally
      expect(vp.panY).toBeGreaterThan(0); // centred vertically
    });

    it("clamps zoom to MIN_ZOOM for tiny containers", () => {
      const ref = makeContainerRef();
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));
      const vp = result.current.computeFit(1, 1);
      expect(vp.zoom).toBe(MIN_ZOOM);
    });

    it("centres the canvas in the container", () => {
      const ref = makeContainerRef();
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));
      const containerW = 800;
      const containerH = 600;
      const vp = result.current.computeFit(containerW, containerH);
      // panX = (w - canvasW * zoom) / 2   →  should centre horizontally
      expect(vp.panX).toBeCloseTo((containerW - CANVAS_W * vp.zoom) / 2, 5);
      expect(vp.panY).toBeCloseTo((containerH - CANVAS_H * vp.zoom) / 2, 5);
    });
  });

  describe("ResizeObserver — initial resize", () => {
    it("fires setVp with a computed fit on first resize", () => {
      const ref = makeContainerRef();
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));

      // Initially vp is the default { zoom:1, panX:0, panY:0 }.
      expect(result.current.vp.zoom).toBe(1);

      fireResize(800, 600);

      // After the first resize, vp should reflect the fit calculation.
      const expected = result.current.computeFit(800, 600);
      expect(result.current.vp.zoom).toBeCloseTo(expected.zoom, 5);
    });

    it("registers exactly one ResizeObserver and observes the container", () => {
      const ref = makeContainerRef();
      renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));
      expect(capturedROCallbacks).toHaveLength(1);
      expect(roMocks[0].observe).toHaveBeenCalledWith(ref.current);
    });

    it("disconnects the ResizeObserver on unmount", () => {
      const ref = makeContainerRef();
      const { unmount } = renderHook(() =>
        useViewport(ref, CANVAS_W, CANVAS_H),
      );
      unmount();
      expect(roMocks[0].disconnect).toHaveBeenCalled();
    });
  });

  describe("ResizeObserver — subsequent resizes", () => {
    it("re-fits when fitted=true (default) on second resize", () => {
      const ref = makeContainerRef();
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));

      fireResize(800, 600);
      // Still in fitted mode; a second resize should also refit.
      fireResize(1000, 700);

      const expected = result.current.computeFit(1000, 700);
      expect(result.current.vp.zoom).toBeCloseTo(expected.zoom, 5);
    });

    it("preserves zoom when fitted=false and slides pan to maintain centre", () => {
      const ref = makeContainerRef();
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));

      // Initial fit at 800×600.
      fireResize(800, 600);
      const zoomAfterFit = result.current.vp.zoom;

      // Switch out of fitted mode.
      act(() => result.current.setFitted(false));

      // Resize to a different container; zoom should be preserved.
      fireResize(1000, 600);
      expect(result.current.vp.zoom).toBe(zoomAfterFit);
    });
  });

  describe("fitToView", () => {
    it("updates vp to a fit for the current container size", () => {
      const ref = makeContainerRef(800, 600);
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));

      act(() => result.current.fitToView());

      const expected = result.current.computeFit(800, 600);
      expect(result.current.vp.zoom).toBeCloseTo(expected.zoom, 5);
    });

    it("sets fitted to true", () => {
      const ref = makeContainerRef(800, 600);
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));
      act(() => result.current.setFitted(false));
      expect(result.current.fitted).toBe(false);

      act(() => result.current.fitToView());
      expect(result.current.fitted).toBe(true);
    });

    it("does nothing when containerRef is null", () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement | null>;
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));
      // Should not throw; vp stays default.
      act(() => result.current.fitToView());
      expect(result.current.vp.zoom).toBe(1);
    });
  });

  describe("containerSize", () => {
    it("is updated by the ResizeObserver", () => {
      const ref = makeContainerRef();
      const { result } = renderHook(() => useViewport(ref, CANVAS_W, CANVAS_H));

      expect(result.current.containerSize).toEqual({ w: 0, h: 0 });
      fireResize(800, 600);
      expect(result.current.containerSize).toEqual({ w: 800, h: 600 });
    });
  });
});
