/**
 * useCanvasPanZoom — wheel-zoom handler for PlotCanvas.
 *
 * Attaches a non-passive wheel listener to the container so zoom can
 * prevent the browser's native page scroll.  Zoom is centred on the
 * cursor position (or the container centre when no clientX/Y given).
 */
import { useCallback, useEffect, type RefObject } from "react";
import { MIN_ZOOM, MAX_ZOOM } from "../constants";
import type { Vp } from "../types";

export function useCanvasPanZoom(
  containerRef: RefObject<HTMLDivElement | null>,
  vpRef: RefObject<Vp>,
  setVp: (next: Vp) => void,
  setFitted: (v: boolean) => void,
) {
  const zoomBy = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = clientX !== undefined ? clientX - rect.left : rect.width / 2;
      const my = clientY !== undefined ? clientY - rect.top : rect.height / 2;
      const old = vpRef.current;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, old.zoom * factor));
      const cx = (mx - old.panX) / old.zoom;
      const cy = (my - old.panY) / old.zoom;
      setVp({
        zoom: newZoom,
        panX: mx - cx * newZoom,
        panY: my - cy * newZoom,
      });
      setFitted(false);
    },
    [containerRef, vpRef, setVp, setFitted],
  );

  // ── Scroll wheel → zoom (non-passive so we can preventDefault) ──────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, zoomBy]);

  return { zoomBy };
}
