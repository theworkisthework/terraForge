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

function keyDown(code: string, repeat = false) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { code, bubbles: true, repeat }),
  );
}

function keyUp(code: string) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
}

describe("useSpaceKeyPan", () => {
  describe("space key state", () => {
    it("sets spaceDown and spaceRef on Space keydown", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => keyDown("Space"));
      expect(result.current.spaceDown).toBe(true);
      expect(result.current.spaceRef.current).toBe(true);
    });

    it("clears spaceDown and spaceRef on Space keyup", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => {
        keyDown("Space");
        keyUp("Space");
      });
      expect(result.current.spaceDown).toBe(false);
      expect(result.current.spaceRef.current).toBe(false);
    });

    it("does not fire on repeat keydown", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      // repeat=true should not re-run the handler (but for spaceDown: first
      // real press sets it, repeat does not reset it)
      act(() => keyDown("Space"));
      expect(result.current.spaceDown).toBe(true);
      // Dispatching a repeat event should be ignored (e.repeat check)
      act(() => keyDown("Space", true));
      // spaceDown stays true (it was already set by the first press)
      expect(result.current.spaceDown).toBe(true);
    });

    it("does not react to non-Space keys", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { code: "KeyA", bubbles: true }),
        );
      });
      expect(result.current.spaceDown).toBe(false);
    });

    it("does not react when target is an input", () => {
      const { vpRef, setVp, setFitted } = makeRefs();
      const { result } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      const input = document.createElement("input");
      document.body.appendChild(input);
      // Focus the input so it's the event target, then dispatch from it
      input.focus();
      // The event bubbles to window; the handler checks e.target instanceof HTMLInputElement
      input.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
      );
      expect(result.current.spaceDown).toBe(false);
      document.body.removeChild(input);
    });

    it("cleans up listeners on unmount", () => {
      const remove = vi.spyOn(window, "removeEventListener");
      const { vpRef, setVp, setFitted } = makeRefs();
      const { unmount } = renderHook(() =>
        useSpaceKeyPan(vpRef, setVp, setFitted),
      );
      unmount();
      expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
      expect(remove).toHaveBeenCalledWith("keyup", expect.any(Function));
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
