import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useObjectDrag } from "./useObjectDrag";
import { useCanvasStore } from "../../../store/canvasStore";
import { createSvgImport } from "../../../../../../tests/helpers/factories";
import type { Vp } from "../types";

// ── Store reset ───────────────────────────────────────────────────────────────

const INITIAL_STORE = {
  imports: [],
  selectedImportId: null,
  allImportsSelected: false,
  selectedGroupId: null,
  layerGroups: [],
};

beforeEach(() => {
  useCanvasStore.setState(INITIAL_STORE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVpRef(zoom = 1): { current: Vp } {
  return { current: { zoom, panX: 0, panY: 0 } };
}

function makeSpaceRef(held = false) {
  return { current: held };
}

function fakeMouseEvent(ox: number, oy: number): React.MouseEvent {
  return {
    clientX: ox,
    clientY: oy,
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent;
}

function fakeRectMouseEvent(
  ox: number,
  oy: number,
): React.MouseEvent<SVGRectElement> {
  return {
    clientX: ox,
    clientY: oy,
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent<SVGRectElement>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useObjectDrag", () => {
  it("starts with dragging null", () => {
    const vpRef = makeVpRef();
    const spaceRef = makeSpaceRef();
    const { result } = renderHook(() =>
      useObjectDrag(vpRef, spaceRef, vi.fn(), vi.fn()),
    );
    expect(result.current.dragging).toBeNull();
  });

  describe("onImportMouseDown", () => {
    it("does nothing when space is held", () => {
      const imp = createSvgImport({ id: "imp1", x: 10, y: 20 });
      useCanvasStore.setState({ imports: [imp] });
      const spaceRef = makeSpaceRef(true);
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), spaceRef, vi.fn(), vi.fn()),
      );
      act(() =>
        result.current.onImportMouseDown(fakeMouseEvent(100, 100), "imp1"),
      );
      expect(result.current.dragging).toBeNull();
    });

    it("sets dragging for single import", () => {
      const imp = createSvgImport({ id: "imp1", x: 5, y: 10 });
      useCanvasStore.setState({ imports: [imp] });
      const selectImport = vi.fn();
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), makeSpaceRef(), selectImport, vi.fn()),
      );
      act(() =>
        result.current.onImportMouseDown(fakeMouseEvent(200, 150), "imp1"),
      );
      expect(selectImport).toHaveBeenCalledWith("imp1");
      expect(result.current.dragging).toMatchObject({
        id: "imp1",
        startMouseX: 200,
        startMouseY: 150,
        startObjX: 5,
        startObjY: 10,
      });
      expect(result.current.dragging?.group).toBeUndefined();
    });

    it("sets group drag when allImportsSelected", () => {
      const imp1 = createSvgImport({ id: "a", x: 0, y: 0 });
      const imp2 = createSvgImport({ id: "b", x: 5, y: 5 });
      useCanvasStore.setState({
        imports: [imp1, imp2],
        allImportsSelected: true,
      });
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), makeSpaceRef(), vi.fn(), vi.fn()),
      );
      act(() =>
        result.current.onImportMouseDown(fakeMouseEvent(100, 100), "a"),
      );
      expect(result.current.dragging?.group).toHaveLength(2);
      expect(result.current.dragging?.group?.[0]).toMatchObject({
        id: "a",
        startX: 0,
        startY: 0,
      });
    });
  });

  describe("updateDragMove", () => {
    it("does nothing when not dragging", () => {
      const updateImport = vi.fn();
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), makeSpaceRef(), vi.fn(), updateImport),
      );
      act(() =>
        result.current.updateDragMove(
          new MouseEvent("mousemove", { clientX: 10, clientY: 10 }),
        ),
      );
      expect(updateImport).not.toHaveBeenCalled();
    });

    it("calls updateImport with correct mm delta for single import", () => {
      const imp = createSvgImport({ id: "imp1", x: 0, y: 0 });
      useCanvasStore.setState({ imports: [imp] });
      const updateImport = vi.fn();
      const vpRef = makeVpRef(1); // zoom=1
      const { result } = renderHook(() =>
        useObjectDrag(vpRef, makeSpaceRef(), vi.fn(), updateImport),
      );
      // Start drag at (100, 100)
      act(() =>
        result.current.onImportMouseDown(fakeMouseEvent(100, 100), "imp1"),
      );
      // Move by +30px in X, +15px in Y
      act(() =>
        result.current.updateDragMove(
          new MouseEvent("mousemove", { clientX: 130, clientY: 115 }),
        ),
      );
      // MM_TO_PX = 3, zoom = 1: dx = 30/3 = 10mm, dy = -15/3 = -5mm (Y inverted)
      expect(updateImport).toHaveBeenCalledWith("imp1", {
        x: 10,
        y: -5,
      });
    });

    it("applies zoom to delta calculation", () => {
      const imp = createSvgImport({ id: "imp1", x: 0, y: 0 });
      useCanvasStore.setState({ imports: [imp] });
      const updateImport = vi.fn();
      const vpRef = makeVpRef(2); // zoom=2
      const { result } = renderHook(() =>
        useObjectDrag(vpRef, makeSpaceRef(), vi.fn(), updateImport),
      );
      act(() =>
        result.current.onImportMouseDown(fakeMouseEvent(100, 100), "imp1"),
      );
      act(() =>
        result.current.updateDragMove(
          new MouseEvent("mousemove", { clientX: 112, clientY: 100 }),
        ),
      );
      // MM_TO_PX=3, zoom=2: dx = 12/(3*2) = 2mm
      expect(updateImport).toHaveBeenCalledWith("imp1", { x: 2, y: 0 });
    });
  });

  describe("endDrag", () => {
    it("returns false for single-import drag", () => {
      const imp = createSvgImport({ id: "imp1" });
      useCanvasStore.setState({ imports: [imp] });
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), makeSpaceRef(), vi.fn(), vi.fn()),
      );
      act(() => result.current.onImportMouseDown(fakeMouseEvent(0, 0), "imp1"));
      let wasGroup = true;
      act(() => {
        wasGroup = result.current.endDrag();
      });
      expect(wasGroup).toBe(false);
      expect(result.current.dragging).toBeNull();
    });

    it("returns true for group drag", () => {
      const imp1 = createSvgImport({ id: "a" });
      const imp2 = createSvgImport({ id: "b" });
      useCanvasStore.setState({
        imports: [imp1, imp2],
        allImportsSelected: true,
      });
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), makeSpaceRef(), vi.fn(), vi.fn()),
      );
      act(() => result.current.onImportMouseDown(fakeMouseEvent(0, 0), "a"));
      let wasGroup = false;
      act(() => {
        wasGroup = result.current.endDrag();
      });
      expect(wasGroup).toBe(true);
    });

    it("endDrag returns false when not dragging", () => {
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), makeSpaceRef(), vi.fn(), vi.fn()),
      );
      let wasGroup = true;
      act(() => {
        wasGroup = result.current.endDrag();
      });
      expect(wasGroup).toBe(false);
    });
  });

  describe("onGroupMouseDown", () => {
    it("sets group drag with all imports when no group selected", () => {
      const imp1 = createSvgImport({ id: "a", x: 1, y: 2 });
      const imp2 = createSvgImport({ id: "b", x: 3, y: 4 });
      useCanvasStore.setState({ imports: [imp1, imp2] });
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), makeSpaceRef(), vi.fn(), vi.fn()),
      );
      act(() => result.current.onGroupMouseDown(fakeRectMouseEvent(50, 60)));
      expect(result.current.dragging?.id).toBe("__group__");
      expect(result.current.dragging?.group).toHaveLength(2);
    });

    it("does nothing when space is held", () => {
      const { result } = renderHook(() =>
        useObjectDrag(makeVpRef(), makeSpaceRef(true), vi.fn(), vi.fn()),
      );
      act(() => result.current.onGroupMouseDown(fakeRectMouseEvent(50, 60)));
      expect(result.current.dragging).toBeNull();
    });
  });
});
