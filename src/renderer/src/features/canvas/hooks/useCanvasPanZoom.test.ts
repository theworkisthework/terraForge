import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasPanZoom } from "./useCanvasPanZoom";
import { MIN_ZOOM, MAX_ZOOM } from "../constants";
import type { Vp } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer() {
  const div = document.createElement("div");
  div.getBoundingClientRect = () =>
    ({ width: 800, height: 600, top: 0, left: 0 }) as DOMRect;
  document.body.appendChild(div);
  return div;
}

function makeRefs(vp: Vp = { zoom: 1, panX: 0, panY: 0 }) {
  const containerDiv = makeContainer();
  const containerRef = { current: containerDiv };
  const vpRef = { current: { ...vp } };
  const setVp = vi.fn((next: Vp) => {
    vpRef.current = next;
  });
  const setFitted = vi.fn();
  return { containerRef, vpRef, setVp, setFitted, containerDiv };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useCanvasPanZoom", () => {
  describe("zoomBy", () => {
    it("increases zoom when factor > 1", () => {
      const { containerRef, vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useCanvasPanZoom(containerRef, vpRef, setVp, setFitted),
      );
      act(() => result.current.zoomBy(2));
      expect(setVp).toHaveBeenCalled();
      const next = setVp.mock.calls[0][0] as Vp;
      expect(next.zoom).toBeGreaterThan(1);
    });

    it("decreases zoom when factor < 1", () => {
      const { containerRef, vpRef, setVp, setFitted } = makeRefs({
        zoom: 4,
        panX: 0,
        panY: 0,
      });
      const { result } = renderHook(() =>
        useCanvasPanZoom(containerRef, vpRef, setVp, setFitted),
      );
      act(() => result.current.zoomBy(0.5));
      const next = setVp.mock.calls[0][0] as Vp;
      expect(next.zoom).toBeLessThan(4);
    });

    it("clamps zoom to MAX_ZOOM", () => {
      const { containerRef, vpRef, setVp, setFitted } = makeRefs({
        zoom: MAX_ZOOM,
        panX: 0,
        panY: 0,
      });
      const { result } = renderHook(() =>
        useCanvasPanZoom(containerRef, vpRef, setVp, setFitted),
      );
      act(() => result.current.zoomBy(10));
      const next = setVp.mock.calls[0][0] as Vp;
      expect(next.zoom).toBe(MAX_ZOOM);
    });

    it("clamps zoom to MIN_ZOOM", () => {
      const { containerRef, vpRef, setVp, setFitted } = makeRefs({
        zoom: MIN_ZOOM,
        panX: 0,
        panY: 0,
      });
      const { result } = renderHook(() =>
        useCanvasPanZoom(containerRef, vpRef, setVp, setFitted),
      );
      act(() => result.current.zoomBy(0.0001));
      const next = setVp.mock.calls[0][0] as Vp;
      expect(next.zoom).toBe(MIN_ZOOM);
    });

    it("calls setFitted(false)", () => {
      const { containerRef, vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useCanvasPanZoom(containerRef, vpRef, setVp, setFitted),
      );
      act(() => result.current.zoomBy(1.5));
      expect(setFitted).toHaveBeenCalledWith(false);
    });

    it("zooms centred on provided client coords — point under cursor stays fixed", () => {
      // The fixed-point equation:  panX_new = clientX_rel - (clientX_rel - panX) / zoom * newZoom
      const initVp: Vp = { zoom: 2, panX: 100, panY: 50 };
      const { containerRef, vpRef, setVp, setFitted } = makeRefs(initVp);
      // container: left=0, top=0, width=800, height=600
      const clientX = 300; // relative to container: 300 - 0 = 300
      const clientY = 200; // relative: 200
      const { result } = renderHook(() =>
        useCanvasPanZoom(containerRef, vpRef, setVp, setFitted),
      );
      act(() => result.current.zoomBy(2, clientX, clientY));
      const next = setVp.mock.calls[0][0] as Vp;
      // Content point under cursor:
      const cx = (300 - initVp.panX) / initVp.zoom; // = (300-100)/2 = 100
      const cy = (200 - initVp.panY) / initVp.zoom; // = (200-50)/2 = 75
      expect(next.panX).toBeCloseTo(300 - cx * next.zoom, 5);
      expect(next.panY).toBeCloseTo(200 - cy * next.zoom, 5);
    });

    it("does nothing when containerRef is null", () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement | null>;
      const vpRef = { current: { zoom: 1, panX: 0, panY: 0 } };
      const setVp = vi.fn();
      const setFitted = vi.fn();
      const { result } = renderHook(() =>
        useCanvasPanZoom(ref, vpRef, setVp, setFitted),
      );
      act(() => result.current.zoomBy(2));
      expect(setVp).not.toHaveBeenCalled();
    });
  });

  describe("wheel event listener", () => {
    it("scroll up (deltaY < 0) calls zoomBy with factor > 1", () => {
      const { containerRef, vpRef, setVp, setFitted, containerDiv } =
        makeRefs();
      renderHook(() => useCanvasPanZoom(containerRef, vpRef, setVp, setFitted));
      act(() => {
        containerDiv.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -100,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      expect(setVp).toHaveBeenCalled();
      const next = setVp.mock.calls[0][0] as Vp;
      expect(next.zoom).toBeGreaterThan(1);
    });

    it("scroll down (deltaY > 0) calls zoomBy with factor < 1", () => {
      const { containerRef, vpRef, setVp, setFitted, containerDiv } = makeRefs({
        zoom: 4,
        panX: 0,
        panY: 0,
      });
      renderHook(() => useCanvasPanZoom(containerRef, vpRef, setVp, setFitted));
      act(() => {
        containerDiv.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: 100,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      expect(setVp).toHaveBeenCalled();
      const next = setVp.mock.calls[0][0] as Vp;
      expect(next.zoom).toBeLessThan(4);
    });

    it("calls preventDefault on wheel event", () => {
      const { containerRef, vpRef, setVp, setFitted, containerDiv } =
        makeRefs();
      renderHook(() => useCanvasPanZoom(containerRef, vpRef, setVp, setFitted));
      const event = new WheelEvent("wheel", {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        containerDiv.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
    });

    it("removes wheel listener on unmount", () => {
      const { containerRef, vpRef, setVp, setFitted, containerDiv } =
        makeRefs();
      const removeSpy = vi.spyOn(containerDiv, "removeEventListener");
      const { unmount } = renderHook(() =>
        useCanvasPanZoom(containerRef, vpRef, setVp, setFitted),
      );
      unmount();
      expect(removeSpy).toHaveBeenCalledWith("wheel", expect.any(Function));
    });
  });
});
