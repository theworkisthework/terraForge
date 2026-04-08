/**
 * useSpaceKeyPan — space-key pan mode and mouse-pan state machine.
 *
 * Owns:
 *   - spaceDown / spaceRef: space-key pressed state (ref for closure access)
 *   - isPanning: true while a pan drag is in flight
 *   - panStartRef: anchor point for the current pan gesture
 *   - startPan: begin a pan gesture (called from mousedown)
 *   - updatePanMove: apply pan delta on each mousemove; returns true if handled
 *   - endPan: commit end of pan gesture
 *
 * Space key listeners are installed here. Other keyboard shortcuts live in
 * useCanvasKeyboardShortcuts (Phase 5).
 */
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type RefObject,
} from "react";
import type { Vp } from "../types";

export function useSpaceKeyPan(
  vpRef: RefObject<Vp>,
  setVp: (next: Vp) => void,
  setFitted: (v: boolean) => void,
) {
  const panStartRef = useRef<{
    mx: number;
    my: number;
    panX: number;
    panY: number;
  } | null>(null);

  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      panStartRef.current = {
        mx: clientX,
        my: clientY,
        panX: vpRef.current.panX,
        panY: vpRef.current.panY,
      };
      setIsPanning(true);
    },
    [vpRef],
  );

  /**
   * Called from the window mousemove handler.
   * Returns true if the pan gesture consumed the event (caller should early-return).
   */
  const updatePanMove = useCallback(
    (e: MouseEvent): boolean => {
      if (!panStartRef.current) return false;
      const dx = e.clientX - panStartRef.current.mx;
      const dy = e.clientY - panStartRef.current.my;
      setVp({
        zoom: vpRef.current.zoom,
        panX: panStartRef.current.panX + dx,
        panY: panStartRef.current.panY + dy,
      });
      setFitted(false);
      return true;
    },
    [vpRef, setVp, setFitted],
  );

  const endPan = useCallback(() => {
    if (panStartRef.current) {
      panStartRef.current = null;
      setIsPanning(false);
    }
  }, []);

  // ── Space key listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceRef.current = true;
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceDown(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return {
    spaceDown,
    spaceRef,
    isPanning,
    panStartRef,
    startPan,
    updatePanMove,
    endPan,
  };
}
