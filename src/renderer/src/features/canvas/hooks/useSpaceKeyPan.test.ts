import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpaceKeyPan } from "./useSpaceKeyPan";
import type { Vp } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRefs(vp: Vp = { zoom: 1, panX: 0, panY: 0 }) {
  const vpRef = { current: { ...vp } };
  const setVp = vi.fn((next: Vp) => {
    vpRef.current = next;
  });
  const setFitted = vi.fn();
  return { vpRef, setVp, setFitted };
}

describe("useSpaceKeyPan", () => {
  describe("space state", () => {
    it("setSpacePressed(true) sets spaceDown and spaceRef", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => result.current.setSpacePressed(true));
      expect(result.current.spaceDown).toBe(true);
      expect(result.current.spaceRef.current).toBe(true);
    });

    it("setSpacePressed(false) clears spaceDown and spaceRef", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => {
        result.current.setSpacePressed(true);
        result.current.setSpacePressed(false);
      });
      expect(result.current.spaceDown).toBe(false);
      expect(result.current.spaceRef.current).toBe(false);
    });

    it("setSpacePressed is idempotent for repeated true", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => result.current.setSpacePressed(true));
      expect(result.current.spaceDown).toBe(true);
      act(() => result.current.setSpacePressed(true));
      expect(result.current.spaceDown).toBe(true);
    });
  });

  describe("pan gesture", () => {
    it("startPan stores anchor point in panStartRef and sets isPanning", () => {
      const { vpRef, setVp, setFitted } = makeRefs({
        zoom: 2,
        panX: 50,
        panY: 30,
      });
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => result.current.startPan(200, 150));
      expect(result.current.isPanning).toBe(true);
      expect(result.current.panStartRef.current).toEqual({
        mx: 200,
        my: 150,
        panX: 50,
        panY: 30,
      });
    });

    it("updatePanMove returns false when not panning", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      let consumed = false;
      act(() => {
        consumed = result.current.updatePanMove(
          new MouseEvent("mousemove", { clientX: 10, clientY: 10 }),
        );
      });
      expect(consumed).toBe(false);
      expect(setVp).not.toHaveBeenCalled();
    });

    it("updatePanMove returns true and updates vp when panning", () => {
      const { vpRef, setVp, setFitted } = makeRefs({
        zoom: 1,
        panX: 0,
        panY: 0,
      });
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => result.current.startPan(100, 100));
      let consumed = false;
      act(() => {
        consumed = result.current.updatePanMove(
          new MouseEvent("mousemove", { clientX: 120, clientY: 110 }),
        );
      });
      expect(consumed).toBe(true);
      expect(setVp).toHaveBeenCalledWith(
        expect.objectContaining({ panX: 20, panY: 10 }),
      );
      expect(setFitted).toHaveBeenCalledWith(false);
    });

    it("endPan clears panStartRef and isPanning", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => result.current.startPan(50, 50));
      expect(result.current.isPanning).toBe(true);
      act(() => result.current.endPan());
      expect(result.current.isPanning).toBe(false);
      expect(result.current.panStartRef.current).toBeNull();
    });

    it("endPan is a no-op when not panning", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      // Should not throw
      act(() => result.current.endPan());
      expect(result.current.isPanning).toBe(false);
    });
  });
});
