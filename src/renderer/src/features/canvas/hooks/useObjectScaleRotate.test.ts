import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useObjectScaleRotate } from "./useObjectScaleRotate";
import { useCanvasStore } from "../../../store/canvasStore";
import { createSvgImport } from "../../../../../../tests/helpers/factories";
import { MM_TO_PX } from "../constants";
import type { Vp } from "../types";

const INITIAL_STORE = {
  imports: [],
  selectedImportId: null,
  allImportsSelected: false,
  selectedGroupId: null,
};

beforeEach(() => {
  useCanvasStore.setState(INITIAL_STORE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeContainer(left = 0, top = 0) {
  const div = document.createElement("div");
  div.getBoundingClientRect = () =>
    ({ left, top, width: 800, height: 600 }) as DOMRect;
  return div;
}

function makeRefs(zoom = 1) {
  const containerRef: { current: HTMLDivElement | null } = {
    current: makeContainer(),
  };
  const vpRef: { current: Vp } = { current: { zoom, panX: 0, panY: 0 } };
  return { containerRef, vpRef };
}

function fakeCircleEvent(
  clientX: number,
  clientY: number,
): React.MouseEvent<SVGCircleElement> {
  return {
    clientX,
    clientY,
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent<SVGCircleElement>;
}

describe("useObjectScaleRotate", () => {
  describe("initial state", () => {
    it("scaling and rotating are null on init", () => {
      const { containerRef, vpRef } = makeRefs();
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, vi.fn()),
      );
      expect(result.current.scaling).toBeNull();
      expect(result.current.rotating).toBeNull();
    });
  });

  describe("onHandleMouseDown", () => {
    it("sets scaling with correct fields for a ratio-locked import", () => {
      const imp = createSvgImport({
        id: "imp1",
        x: 10,
        y: 20,
        scale: 2,
        svgWidth: 50,
        svgHeight: 40,
      });
      useCanvasStore.setState({ imports: [imp] });
      const { containerRef, vpRef } = makeRefs();
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, vi.fn()),
      );
      act(() =>
        result.current.onHandleMouseDown(
          fakeCircleEvent(300, 200),
          "imp1",
          "br",
        ),
      );
      const s = result.current.scaling!;
      expect(s.id).toBe("imp1");
      expect(s.handle).toBe("br");
      expect(s.startScale).toBe(2);
      expect(s.startScaleX).toBe(2);
      expect(s.startScaleY).toBe(2);
      expect(s.ratioLocked).toBe(true); // scaleX is undefined → locked
      expect(s.startW).toBeCloseTo(imp.svgWidth * 2 * MM_TO_PX);
      expect(s.startH).toBeCloseTo(imp.svgHeight * 2 * MM_TO_PX);
    });

    it("sets scaling as ratio-unlocked when scaleX is set", () => {
      const imp = createSvgImport({
        id: "imp1",
        scale: 1,
        scaleX: 2,
        scaleY: 3,
        svgWidth: 50,
        svgHeight: 40,
      });
      useCanvasStore.setState({ imports: [imp] });
      const { containerRef, vpRef } = makeRefs();
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, vi.fn()),
      );
      act(() =>
        result.current.onHandleMouseDown(
          fakeCircleEvent(100, 100),
          "imp1",
          "r",
        ),
      );
      expect(result.current.scaling?.ratioLocked).toBe(false);
    });
  });

  describe("updateScaleMove", () => {
    it("does nothing when not scaling", () => {
      const updateImport = vi.fn();
      const { containerRef, vpRef } = makeRefs();
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, updateImport),
      );
      act(() =>
        result.current.updateScaleMove(
          new MouseEvent("mousemove", { clientX: 100, clientY: 100 }),
        ),
      );
      expect(updateImport).not.toHaveBeenCalled();
    });

    it("calls updateImport for locked scale drag on br handle", () => {
      const imp = createSvgImport({
        id: "imp1",
        scale: 1,
        svgWidth: 100,
        svgHeight: 100,
      });
      useCanvasStore.setState({ imports: [imp] });
      const updateImport = vi.fn();
      const { containerRef, vpRef } = makeRefs(1);
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, updateImport),
      );
      // Start scale at (100, 100) with br handle — dx=+positive grows br handle
      act(() =>
        result.current.onHandleMouseDown(
          fakeCircleEvent(100, 100),
          "imp1",
          "br",
        ),
      );
      // startW = 100*1*3 = 300px; move dx=30 → delta=30, scale *= (1 + 30/300) = 1.1
      act(() =>
        result.current.updateScaleMove(
          new MouseEvent("mousemove", { clientX: 130, clientY: 100 }),
        ),
      );
      expect(updateImport).toHaveBeenCalledWith("imp1", {
        scale: expect.closeTo(1.1, 5),
        scaleX: undefined,
        scaleY: undefined,
      });
    });

    it("calls updateImport for independent axis scale on r handle", () => {
      const imp = createSvgImport({
        id: "imp1",
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        svgWidth: 100,
        svgHeight: 100,
      });
      useCanvasStore.setState({ imports: [imp] });
      const updateImport = vi.fn();
      const { containerRef, vpRef } = makeRefs(1);
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, updateImport),
      );
      act(() =>
        result.current.onHandleMouseDown(
          fakeCircleEvent(100, 100),
          "imp1",
          "r",
        ),
      );
      // r handle: only X axis, dx=30, startW=300, deltaX=+30
      act(() =>
        result.current.updateScaleMove(
          new MouseEvent("mousemove", { clientX: 130, clientY: 100 }),
        ),
      );
      const call = updateImport.mock.calls[0][1] as {
        scaleX?: number;
        scaleY?: number;
      };
      expect(call.scaleX).toBeCloseTo(1.1, 5);
      expect(call.scaleY).toBeUndefined(); // r handle doesn't affect Y
    });
  });

  describe("endScale / endRotate", () => {
    it("endScale clears scaling", () => {
      const imp = createSvgImport({ id: "i1" });
      useCanvasStore.setState({ imports: [imp] });
      const { containerRef, vpRef } = makeRefs();
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, vi.fn()),
      );
      act(() =>
        result.current.onHandleMouseDown(fakeCircleEvent(0, 0), "i1", "tl"),
      );
      expect(result.current.scaling).not.toBeNull();
      act(() => result.current.endScale());
      expect(result.current.scaling).toBeNull();
    });

    it("endRotate clears rotating", () => {
      const imp = createSvgImport({ id: "i1", rotation: 0 });
      useCanvasStore.setState({ imports: [imp] });
      const { containerRef, vpRef } = makeRefs();
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, vi.fn()),
      );
      act(() =>
        result.current.onRotateHandleMouseDown(
          fakeCircleEvent(10, 10),
          "i1",
          100,
          100,
        ),
      );
      expect(result.current.rotating).not.toBeNull();
      act(() => result.current.endRotate());
      expect(result.current.rotating).toBeNull();
    });
  });

  describe("onRotateHandleMouseDown", () => {
    it("sets rotating with correct startAngle", () => {
      const imp = createSvgImport({ id: "i1", rotation: 45 });
      useCanvasStore.setState({ imports: [imp] });
      const { containerRef, vpRef } = makeRefs();
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, vi.fn()),
      );
      // Centre of object at (100, 100) in SVG space; mouse at (110, 100) → angle = 0
      act(() =>
        result.current.onRotateHandleMouseDown(
          fakeCircleEvent(110, 100), // clientX=110, clientY=100; vp.panX=0, zoom=1
          "i1",
          100,
          100,
        ),
      );
      const r = result.current.rotating!;
      expect(r.id).toBe("i1");
      expect(r.cx).toBe(100);
      expect(r.cy).toBe(100);
      expect(r.startRotation).toBe(45);
      expect(r.startAngle).toBeCloseTo(0); // atan2(0, 10) = 0
    });
  });

  describe("updateRotateMove", () => {
    it("calls updateImport with rotation delta", () => {
      const imp = createSvgImport({ id: "i1", rotation: 0 });
      useCanvasStore.setState({ imports: [imp] });
      const updateImport = vi.fn();
      const { containerRef, vpRef } = makeRefs();
      const { result } = renderHook(() =>
        useObjectScaleRotate(containerRef, vpRef, updateImport),
      );
      // Mouse at (110, 100) → startAngle = 0 (pointing east of centre at 100,100)
      act(() =>
        result.current.onRotateHandleMouseDown(
          fakeCircleEvent(110, 100),
          "i1",
          100,
          100,
        ),
      );
      // Move mouse to (100, 110) → angle = π/2 (pointing south), delta = 90°
      act(() =>
        result.current.updateRotateMove(
          new MouseEvent("mousemove", { clientX: 100, clientY: 110 }),
        ),
      );
      expect(updateImport).toHaveBeenCalledWith("i1", {
        rotation: expect.closeTo(90, 3),
      });
    });
  });
});
