/**
 * useViewport — viewport state, fit calculation, and ResizeObserver for PlotCanvas.
 *
 * Manages:
 *   - vp: zoom + pan state (also mirrored in vpRef for closure access)
 *   - fitted: whether the viewport is in auto-fit mode (re-fit on resize)
 *   - computeFit: pure function mapping container size → Vp
 *   - fitToView: call-site shortcut (reads containerRef, calls computeFit)
 *   - ResizeObserver: initial fit + responsive resize with preserve-zoom support
 *   - containerSize: current container pixel dimensions (updated each resize)
 */
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type RefObject,
} from "react";
import { MIN_ZOOM } from "../constants";
import type { Vp } from "../types";

export function useViewport(
  containerRef: RefObject<HTMLDivElement | null>,
  canvasW: number,
  canvasH: number,
) {
  // ── Viewport state ──────────────────────────────────────────────────────────
  // vpRef mirrors vp for use inside event-handler closures without stale captures.
  const [vp, _setVp] = useState<Vp>({ zoom: 1, panX: 0, panY: 0 });
  const vpRef = useRef<Vp>(vp);
  const setVp = useCallback((next: Vp) => {
    vpRef.current = next;
    _setVp(next);
  }, []);

  // Container dimensions — consumed by ToolpathOverlay and RulerOverlay.
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // fittedRef: true → resize re-fits the bed; false → resize preserves zoom + centre.
  const [fitted, _setFitted] = useState(true);
  const fittedRef = useRef(true);
  const setFitted = useCallback((v: boolean) => {
    fittedRef.current = v;
    _setFitted(v);
  }, []);

  // ── Fit helpers ─────────────────────────────────────────────────────────────
  const computeFit = useCallback(
    (w: number, h: number): Vp => {
      const pad = 8;
      const zoom = Math.max(
        MIN_ZOOM,
        Math.min((w - pad * 2) / canvasW, (h - pad * 2) / canvasH),
      );
      return {
        zoom,
        panX: (w - canvasW * zoom) / 2,
        panY: (h - canvasH * zoom) / 2,
      };
    },
    [canvasW, canvasH],
  );

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setVp(computeFit(width, height));
    setFitted(true);
  }, [containerRef, computeFit, setVp, setFitted]);

  // ── ResizeObserver — initial fit + responsive resize ─────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let first = true;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
      if (first || fittedRef.current) {
        first = false;
        setVp(computeFit(width, height));
      } else {
        // Keep zoom; slide pan to maintain the same content pixel at the centre.
        const old = vpRef.current;
        const cx = (width / 2 - old.panX) / old.zoom;
        const cy = (height / 2 - old.panY) / old.zoom;
        setVp({
          zoom: old.zoom,
          panX: width / 2 - cx * old.zoom,
          panY: height / 2 - cy * old.zoom,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, computeFit, setVp]);

  return {
    vp,
    vpRef,
    setVp,
    fitted,
    setFitted,
    computeFit,
    fitToView,
    containerSize,
  };
}
