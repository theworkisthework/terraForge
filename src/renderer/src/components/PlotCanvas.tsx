// Portions of SVG icon data (square-x, rotate-cw) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
// REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT,
// OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE,
// DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
// ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
import { useRef, useEffect, useState, useCallback } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import type { SvgImport } from "../../../types";

const MM_TO_PX = 3; // internal SVG scale: 3 px per mm
const PAD = 30; // margin around bed in SVG pixels
const HANDLE_R = 5; // handle radius in SVG pixels
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1.25; // per keyboard / button press

// Lucide rotate-cw cursor shown on the rotation handle and while rotating.
// White stroke, 24×24, encoded as an SVG data URL.
// Hotspot centred at (12, 12); fallback to ew-resize for browsers that don't support custom cursors.
const ROTATE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E" +
  "%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/%3E" +
  "%3Cpath d='M21 3v5h-5'/%3E" +
  '%3C/svg%3E") 12 12, ew-resize';

// Handle positions: top-left, top, top-right, right, bottom-right, bottom, bottom-left, left
type HandlePos = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";
const ALL_HANDLES: HandlePos[] = ["tl", "t", "tr", "r", "br", "b", "bl", "l"];

// ─── Viewport ─────────────────────────────────────────────────────────────────
interface Vp {
  zoom: number;
  panX: number;
  panY: number;
}

export function PlotCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const imports = useCanvasStore((s) => s.imports);
  const selectedImportId = useCanvasStore((s) => s.selectedImportId);
  const selectImport = useCanvasStore((s) => s.selectImport);
  const removeImport = useCanvasStore((s) => s.removeImport);
  const updateImport = useCanvasStore((s) => s.updateImport);
  const gcodeToolpath = useCanvasStore((s) => s.gcodeToolpath);
  const setGcodeToolpath = useCanvasStore((s) => s.setGcodeToolpath);
  const activeConfig = useMachineStore((s) => s.activeConfig);

  const config = activeConfig();
  const bedW = config?.bedWidth ?? 220;
  const bedH = config?.bedHeight ?? 200;
  const origin = config?.origin ?? "bottom-left";
  const isBottom = origin === "bottom-left" || origin === "bottom-right";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isCenter = origin === "center";
  // Bed coordinate bounds in machine mm (center origin uses ±half-dim)
  const bedXMin = isCenter ? -bedW / 2 : 0;
  const bedXMax = isCenter ? bedW / 2 : bedW;
  const bedYMin = isCenter ? -bedH / 2 : 0;
  const bedYMax = isCenter ? bedH / 2 : bedH;

  const canvasW = bedW * MM_TO_PX + PAD * 2;
  const canvasH = bedH * MM_TO_PX + PAD * 2;

  // ── Viewport state ────────────────────────────────────────────────────────────
  // vpRef mirrors vp for use inside event-handler closures without stale captures.
  const [vp, _setVp] = useState<Vp>({ zoom: 1, panX: 0, panY: 0 });
  const vpRef = useRef<Vp>(vp);
  const setVp = useCallback((next: Vp) => {
    vpRef.current = next;
    _setVp(next);
  }, []);

  // Container dimensions — fed to RulerOverlay (screen-space rulers).
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // fittedRef: true → resize re-fits the bed; false → resize preserves zoom + center.
  const [fitted, _setFitted] = useState(true);
  const fittedRef = useRef(true);
  const setFitted = useCallback((v: boolean) => {
    fittedRef.current = v;
    _setFitted(v);
  }, []);

  // ── Fit helpers ───────────────────────────────────────────────────────────────
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
  }, [computeFit, setVp, setFitted]);

  // ── Zoom helper — centered on a client-space point or the container centre ────
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
    [setVp, setFitted],
  );

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
  }, [computeFit, setVp]);

  // ── Scroll wheel → zoom (non-passive so we can preventDefault) ───────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // ── Pan state ─────────────────────────────────────────────────────────────────
  const panStartRef = useRef<{
    mx: number;
    my: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const startPan = useCallback((clientX: number, clientY: number) => {
    panStartRef.current = {
      mx: clientX,
      my: clientY,
      panX: vpRef.current.panX,
      panY: vpRef.current.panY,
    };
    setIsPanning(true);
  }, []);

  // ── Drag state (object move) ──────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startObjX: number;
    startObjY: number;
  } | null>(null);

  // ── Scale-handle state ────────────────────────────────────────────────────────
  const [scaling, setScaling] = useState<{
    id: string;
    handle: HandlePos;
    startMouseX: number;
    startMouseY: number;
    startScale: number;
    startObjX: number;
    startObjY: number;
    startW: number;
    startH: number;
  } | null>(null);

  // ── Rotate-handle state ───────────────────────────────────────────────────────
  const [rotating, setRotating] = useState<{
    id: string;
    cx: number; // centre x in SVG canvas px
    cy: number; // centre y in SVG canvas px
    startAngle: number; // atan2 of (mouse → centre) vector at mousedown (rad)
    startRotation: number; // imp.rotation at mousedown (degrees)
  } | null>(null);

  // ── Toolpath selection ────────────────────────────────────────────────────────
  const [toolpathSelected, setToolpathSelected] = useState(false);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Space → enable pan mode
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceRef.current = true;
        setSpaceDown(true);
      }

      // Delete / Backspace → remove selected item
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedImportId) {
          removeImport(selectedImportId);
        } else if (toolpathSelected) {
          setGcodeToolpath(null);
          setToolpathSelected(false);
        }
      }

      // Escape → deselect
      if (e.key === "Escape") {
        selectImport(null);
        setToolpathSelected(false);
      }

      // Ctrl/Cmd + Shift + + / - → keyboard zoom
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomBy(ZOOM_STEP);
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          zoomBy(1 / ZOOM_STEP);
        }
      }

      // Ctrl/Cmd + 0 → fit to view
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        fitToView();
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
  }, [
    selectedImportId,
    toolpathSelected,
    removeImport,
    selectImport,
    setGcodeToolpath,
    zoomBy,
    fitToView,
  ]);

  // Clear toolpath selection when toolpath is removed
  useEffect(() => {
    if (!gcodeToolpath) setToolpathSelected(false);
  }, [gcodeToolpath]);

  // ── SVG coordinate helpers (map machine-mm → canvas SVG px) ─────────────────
  // Y: bottom-origins flip so mm=0 is at the bottom of the bed rectangle.
  const getBedY = (mmY: number) =>
    isBottom ? canvasH - PAD - mmY * MM_TO_PX : PAD + mmY * MM_TO_PX;
  // X: right-origins flip so mm=0 is at the right of the bed rectangle.
  const getBedX = (mmX: number) =>
    isRight ? PAD + (bedW - mmX) * MM_TO_PX : PAD + mmX * MM_TO_PX;

  // ── Object drag handlers ──────────────────────────────────────────────────────
  const onImportMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (spaceRef.current) return; // space held → pan mode, not drag
      e.stopPropagation();
      selectImport(id);
      const imp = useCanvasStore.getState().imports.find((i) => i.id === id);
      if (!imp) return;
      setDragging({
        id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startObjX: imp.x,
        startObjY: imp.y,
      });
    },
    [selectImport],
  );

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, id: string, handle: HandlePos) => {
      e.stopPropagation();
      const imp = useCanvasStore.getState().imports.find((i) => i.id === id);
      if (!imp) return;
      setScaling({
        id,
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startScale: imp.scale,
        startObjX: imp.x,
        startObjY: imp.y,
        startW: imp.svgWidth * imp.scale * MM_TO_PX,
        startH: imp.svgHeight * imp.scale * MM_TO_PX,
      });
    },
    [],
  );

  const onRotateHandleMouseDown = useCallback(
    (
      e: React.MouseEvent<SVGCircleElement>,
      id: string,
      cxSvg: number,
      cySvg: number,
    ) => {
      e.stopPropagation();
      const imp = useCanvasStore.getState().imports.find((i) => i.id === id);
      if (!imp) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const vp = vpRef.current;
      const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
      const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
      setRotating({
        id,
        cx: cxSvg,
        cy: cySvg,
        startAngle: Math.atan2(my - cySvg, mx - cxSvg),
        startRotation: imp.rotation,
      });
    },
    [],
  );

  // ── Unified window mousemove / mouseup ────────────────────────────────────────
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      // Pan (middle mouse or Space + drag) — takes priority
      if (panStartRef.current) {
        const dx = e.clientX - panStartRef.current.mx;
        const dy = e.clientY - panStartRef.current.my;
        setVp({
          zoom: vpRef.current.zoom,
          panX: panStartRef.current.panX + dx,
          panY: panStartRef.current.panY + dy,
        });
        setFitted(false);
        return;
      }

      // Object drag — convert client-px delta → mm (dividing by zoom + MM_TO_PX)
      if (dragging) {
        const zoom = vpRef.current.zoom;
        const dx = (e.clientX - dragging.startMouseX) / (MM_TO_PX * zoom);
        const dy = -(e.clientY - dragging.startMouseY) / (MM_TO_PX * zoom);
        // Look up current dimensions so the far edge can't leave the bed
        const imp = useCanvasStore
          .getState()
          .imports.find((i) => i.id === dragging.id);
        const objW = imp ? imp.svgWidth * imp.scale : 0;
        const objH = imp ? imp.svgHeight * imp.scale : 0;
        updateImport(dragging.id, {
          x: Math.max(
            bedXMin,
            Math.min(dragging.startObjX + dx, bedXMax - objW),
          ),
          y: Math.max(
            bedYMin,
            Math.min(dragging.startObjY + dy, bedYMax - objH),
          ),
        });
      }

      // Scale-handle drag
      if (scaling) {
        const zoom = vpRef.current.zoom;
        const dx = (e.clientX - scaling.startMouseX) / zoom;
        const dy = (e.clientY - scaling.startMouseY) / zoom;
        const h = scaling.handle;

        let delta = 0;
        if (h === "tl" || h === "bl") delta = -dx;
        else if (h === "tr" || h === "br") delta = dx;
        else if (h === "t") delta = -dy;
        else if (h === "b") delta = dy;
        else if (h === "r") delta = dx;
        else if (h === "l") delta = -dx;

        const dimPx = h === "t" || h === "b" ? scaling.startH : scaling.startW;
        const rawScale = Math.max(
          0.05,
          scaling.startScale * (1 + delta / dimPx),
        );
        // Clamp scale so the object's far edge stays within the bed
        const imp = useCanvasStore
          .getState()
          .imports.find((i) => i.id === scaling.id);
        const maxScaleX =
          imp && imp.svgWidth > 0
            ? (bedXMax - scaling.startObjX) / imp.svgWidth
            : Infinity;
        const maxScaleY =
          imp && imp.svgHeight > 0
            ? (bedYMax - scaling.startObjY) / imp.svgHeight
            : Infinity;
        const newScale = Math.min(rawScale, maxScaleX, maxScaleY);
        updateImport(scaling.id, { scale: Math.max(0.05, newScale) });
      }

      // Rotation-handle drag
      if (rotating) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const vp = vpRef.current;
        const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
        const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
        const angle = Math.atan2(my - rotating.cy, mx - rotating.cx);
        const delta = (angle - rotating.startAngle) * (180 / Math.PI);
        updateImport(rotating.id, { rotation: rotating.startRotation + delta });
      }
    },
    [
      dragging,
      scaling,
      rotating,
      bedXMin,
      bedXMax,
      bedYMin,
      bedYMax,
      updateImport,
      setVp,
      setFitted,
    ],
  );

  const onMouseUp = useCallback(() => {
    setDragging(null);
    setScaling(null);
    setRotating(null);
    if (panStartRef.current) {
      panStartRef.current = null;
      setIsPanning(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── Container mousedown — middle mouse + Space+drag pan ───────────────────────
  const onContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        // Middle mouse → pan
        e.preventDefault();
        startPan(e.clientX, e.clientY);
      } else if (e.button === 0 && spaceRef.current) {
        // Space + left click → pan
        e.preventDefault();
        startPan(e.clientX, e.clientY);
      }
    },
    [startPan],
  );

  // Suppress browser context-menu on middle-click release
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => e.preventDefault(),
    [],
  );

  // ── Overlay button handlers ───────────────────────────────────────────────────
  const onZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      zoomBy(ZOOM_STEP);
    },
    [zoomBy],
  );
  const onZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      zoomBy(1 / ZOOM_STEP);
    },
    [zoomBy],
  );
  const onFit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fitToView();
    },
    [fitToView],
  );

  // ── Cursor ────────────────────────────────────────────────────────────────────
  const cursor = spaceDown
    ? isPanning
      ? "grabbing"
      : "grab"
    : isPanning
      ? "grabbing"
      : rotating
        ? ROTATE_CURSOR
        : undefined;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-[#1a1a2e] relative select-none"
      style={{ cursor }}
      onMouseDown={onContainerMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* ── Transformed content layer ─────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          transform: `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`,
          willChange: "transform",
        }}
      >
        <svg
          ref={svgRef}
          width={canvasW}
          height={canvasH}
          className="cursor-default"
          onClick={() => {
            selectImport(null);
            setToolpathSelected(false);
          }}
        >
          {/* Bed background */}
          <rect
            x={PAD}
            y={PAD}
            width={bedW * MM_TO_PX}
            height={bedH * MM_TO_PX}
            fill="#0d1117"
            stroke="#0f3460"
            strokeWidth={1}
          />

          {/* Grid — 10 mm intervals, major every 50 mm */}
          {Array.from(
            { length: Math.floor(bedW / 10) + 1 },
            (_, i) => i * 10,
          ).map((mm) => (
            <line
              key={`vg-${mm}`}
              x1={PAD + mm * MM_TO_PX}
              y1={PAD}
              x2={PAD + mm * MM_TO_PX}
              y2={PAD + bedH * MM_TO_PX}
              stroke="#0f3460"
              strokeWidth={mm % 50 === 0 ? 0.8 : 0.3}
            />
          ))}
          {Array.from(
            { length: Math.floor(bedH / 10) + 1 },
            (_, i) => i * 10,
          ).map((mm) => (
            <line
              key={`hg-${mm}`}
              x1={PAD}
              y1={getBedY(mm)}
              x2={PAD + bedW * MM_TO_PX}
              y2={getBedY(mm)}
              stroke="#0f3460"
              strokeWidth={mm % 50 === 0 ? 0.8 : 0.3}
            />
          ))}

          {/* Rulers are rendered as a screen-space overlay — see below */}

          {/* G-code toolpath overlay */}
          {gcodeToolpath &&
            (() => {
              const { minX, maxX, minY, maxY } = gcodeToolpath.bounds;
              const svgLeft = isCenter
                ? PAD + (bedW / 2 + minX) * MM_TO_PX
                : isRight
                  ? PAD + (bedW - maxX) * MM_TO_PX
                  : PAD + minX * MM_TO_PX;
              const svgRight = isCenter
                ? PAD + (bedW / 2 + maxX) * MM_TO_PX
                : isRight
                  ? PAD + (bedW - minX) * MM_TO_PX
                  : PAD + maxX * MM_TO_PX;
              const svgTop = isCenter
                ? PAD + (bedH / 2 - maxY) * MM_TO_PX
                : isBottom
                  ? PAD + (bedH - maxY) * MM_TO_PX
                  : PAD + minY * MM_TO_PX;
              const svgBottom = isCenter
                ? PAD + (bedH / 2 - minY) * MM_TO_PX
                : isBottom
                  ? PAD + (bedH - minY) * MM_TO_PX
                  : PAD + maxY * MM_TO_PX;
              const bboxW = svgRight - svgLeft;
              const bboxH = svgBottom - svgTop;
              const delCx = svgRight + 14;
              const delCy = svgTop - 14;
              return (
                <>
                  <g
                    transform={`translate(${
                      isCenter
                        ? PAD + (bedW / 2) * MM_TO_PX
                        : isRight
                          ? PAD + bedW * MM_TO_PX
                          : PAD
                    }, ${
                      isCenter
                        ? PAD + (bedH / 2) * MM_TO_PX
                        : isBottom
                          ? PAD + bedH * MM_TO_PX
                          : PAD
                    }) scale(${isRight ? -MM_TO_PX : MM_TO_PX}, ${isCenter || isBottom ? -MM_TO_PX : MM_TO_PX})`}
                  >
                    <clipPath id="bed-clip">
                      <rect
                        x={isCenter ? -bedW / 2 : 0}
                        y={isCenter ? -bedH / 2 : 0}
                        width={bedW}
                        height={bedH}
                      />
                    </clipPath>
                    <g clipPath="url(#bed-clip)">
                      {gcodeToolpath.rapids && (
                        <path
                          d={gcodeToolpath.rapids}
                          stroke="#4a5568"
                          strokeWidth={0.5}
                          fill="none"
                          strokeDasharray="2 1"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {gcodeToolpath.cuts && (
                        <path
                          d={gcodeToolpath.cuts}
                          stroke={toolpathSelected ? "#38bdf8" : "#0ea5e9"}
                          strokeWidth={1.5}
                          fill="none"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {/* Invisible hit-area for selecting the toolpath */}
                      <rect
                        x={minX}
                        y={minY}
                        width={maxX - minX}
                        height={maxY - minY}
                        fill="transparent"
                        style={{ cursor: "pointer" }}
                        vectorEffect="non-scaling-stroke"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectImport(null);
                          setToolpathSelected(true);
                        }}
                      />
                    </g>
                  </g>

                  {toolpathSelected && (
                    <g pointerEvents="none">
                      <rect
                        x={svgLeft}
                        y={svgTop}
                        width={bboxW}
                        height={bboxH}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={1}
                        strokeDasharray="5 3"
                      />
                      {(
                        [
                          [svgLeft, svgTop],
                          [svgRight, svgTop],
                          [svgLeft, svgBottom],
                          [svgRight, svgBottom],
                        ] as [number, number][]
                      ).map(([cx, cy], i) => (
                        <circle
                          key={i}
                          cx={cx}
                          cy={cy}
                          r={2.5}
                          fill="#38bdf8"
                        />
                      ))}
                    </g>
                  )}
                  {toolpathSelected && (
                    <g
                      transform={`translate(${delCx}, ${delCy})`}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setGcodeToolpath(null);
                      }}
                    >
                      <svg
                        x={-8}
                        y={-8}
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          width="18"
                          height="18"
                          x="3"
                          y="3"
                          rx="2"
                          ry="2"
                          fill="#e94560"
                          stroke="none"
                        />
                        <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
                        <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
                      </svg>
                    </g>
                  )}
                </>
              );
            })()}

          {/* SVG imports */}
          {imports
            .filter((imp) => imp.visible)
            .map((imp) => (
              <ImportLayer
                key={imp.id}
                imp={imp}
                selected={selectedImportId === imp.id}
                onImportMouseDown={onImportMouseDown}
                onHandleMouseDown={onHandleMouseDown}
                onRotateHandleMouseDown={onRotateHandleMouseDown}
                onDelete={() => removeImport(imp.id)}
                getBedY={getBedY}
              />
            ))}
        </svg>
      </div>

      {/* ── Zoom / pan overlay controls ───────────────────────────────────── */}
      <div
        className="absolute bottom-9 right-4 flex flex-col gap-1 z-10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          title="Zoom in (Ctrl+Shift++)"
          onClick={onZoomIn}
          className="w-8 h-8 rounded bg-[#16213e] border border-[#0f3460] text-[#e0e0e0] text-base font-bold
                     hover:bg-[#0f3460] active:bg-[#0a2040] flex items-center justify-center leading-none"
        >
          +
        </button>
        <button
          title="Zoom out (Ctrl+Shift+-)"
          onClick={onZoomOut}
          className="w-8 h-8 rounded bg-[#16213e] border border-[#0f3460] text-[#e0e0e0] text-base font-bold
                     hover:bg-[#0f3460] active:bg-[#0a2040] flex items-center justify-center leading-none"
        >
          −
        </button>
        <button
          title={`Fit to view (Ctrl+0)${fitted ? " — active" : ""}`}
          onClick={onFit}
          className={`w-8 h-8 rounded border text-[11px] font-bold flex items-center justify-center leading-none
            ${
              fitted
                ? "bg-[#e94560] border-[#e94560] text-white"
                : "bg-[#16213e] border-[#0f3460] text-[#e0e0e0] hover:bg-[#0f3460]"
            }`}
        >
          ⊡
        </button>
      </div>

      {/* ── Ruler overlay — screen-space, always crisp ──────────────────── */}
      {containerSize.w > 0 && (
        <RulerOverlay
          vp={vp}
          bedW={bedW}
          bedH={bedH}
          origin={config?.origin ?? "bottom-left"}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      )}

      {/* ── Zoom-level badge ─────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-10 text-[10px] text-[#4a5568] font-mono pointer-events-none">
        {Math.round(vp.zoom * 100)}%
      </div>

      {/* ── Space-pan hint ────────────────────────────────────────────────── */}
      {spaceDown && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-center pt-3">
          <span className="text-[10px] text-[#8080a0] bg-[#1a1a2e]/80 px-2 py-0.5 rounded">
            Pan mode · drag to pan · release Space to exit
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Ruler overlay — renders in screen space so text is always native res ─────
//
// X ruler: bottom edge for bottom-left origin, top edge for top-left origin.
// Y ruler: always on the left edge.
// Ticks point INTO the canvas; labels are centered inside their strip.
// Y labels are rotated 90° so they fit the narrow strip without truncation.

const RULER_W = 20; // ruler strip width in screen pixels

interface RulerOverlayProps {
  vp: Vp;
  bedW: number;
  bedH: number;
  origin: "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center";
  containerW: number;
  containerH: number;
}

function RulerOverlay({
  vp,
  bedW,
  bedH,
  origin,
  containerW,
  containerH,
}: RulerOverlayProps) {
  const isBottom = origin === "bottom-left" || origin === "bottom-right";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isCenter = origin === "center";
  const R = RULER_W;

  // ── Coordinate conversions ────────────────────────────────────────────────
  // Center: machine (0,0) at centre of bed; X right, Y up.
  // Right-origins: X mirrors (mm=0 at right edge).
  // Bottom-origins: Y mirrors (mm=0 at bottom edge).
  const mmToSx = (mm: number) =>
    isCenter
      ? vp.panX + (PAD + (bedW / 2 + mm) * MM_TO_PX) * vp.zoom
      : isRight
        ? vp.panX + (PAD + (bedW - mm) * MM_TO_PX) * vp.zoom
        : vp.panX + (PAD + mm * MM_TO_PX) * vp.zoom;
  const mmToSy = (mm: number) =>
    isCenter
      ? vp.panY + (PAD + (bedH / 2 - mm) * MM_TO_PX) * vp.zoom
      : isBottom
        ? vp.panY + (PAD + (bedH - mm) * MM_TO_PX) * vp.zoom
        : vp.panY + (PAD + mm * MM_TO_PX) * vp.zoom;
  const sxToMm = (sx: number) => {
    const raw = ((sx - vp.panX) / vp.zoom - PAD) / MM_TO_PX;
    if (isCenter) return raw - bedW / 2;
    return isRight ? bedW - raw : raw;
  };
  const syToMm = (sy: number) => {
    const raw = ((sy - vp.panY) / vp.zoom - PAD) / MM_TO_PX;
    if (isCenter) return bedH / 2 - raw;
    return isBottom ? bedH - raw : raw;
  };

  // ── Adaptive tick density (~40–100 px between major ticks on screen) ──────
  const pxPerMm = vp.zoom * MM_TO_PX;
  const [major, minor] =
    pxPerMm >= 30
      ? [5, 1]
      : pxPerMm >= 12
        ? [10, 2]
        : pxPerMm >= 6
          ? [20, 5]
          : pxPerMm >= 2
            ? [50, 10]
            : pxPerMm >= 0.8
              ? [100, 20]
              : [200, 50];

  const makeTicks = (
    a: number,
    b: number,
    minMm: number,
    maxMm: number,
  ): number[] => {
    const lo = Math.ceil(Math.min(a, b) / minor) * minor;
    const hi = Math.floor(Math.max(a, b) / minor) * minor;
    const out: number[] = [];
    for (let mm = lo; mm <= hi; mm += minor)
      if (mm >= minMm && mm <= maxMm) out.push(mm);
    return out;
  };

  // ── Layout: X ruler strip (bottom-origins → bottom edge; top-origins → top edge) ──
  const xSepY = isBottom || isCenter ? containerH - R : R;
  const xTickDir = isBottom || isCenter ? 1 : -1; // into the strip
  const xLabelY = isBottom || isCenter ? containerH - R / 2 : R / 2;

  // ── Layout: Y ruler strip (right-origins → right edge; left-origins → left edge) ──
  const ySepX = isRight ? containerW - R : R;
  const yTickDir = isRight ? 1 : -1; // into the strip
  const yLabelX = isRight ? containerW - R / 2 : R / 2;
  const yStripEdgeX = isRight ? containerW - R : 0;
  const yStripTopY = isBottom || isCenter ? 0 : R;
  const yStripBotY = isBottom || isCenter ? containerH - R : containerH;

  // ── Tick ranges ───────────────────────────────────────────────────────────
  const xTickEdge = isRight ? containerW - R : containerW;
  const xBedMin = isCenter ? -bedW / 2 : 0;
  const xBedMax = isCenter ? bedW / 2 : bedW;
  const yBedMin = isCenter ? -bedH / 2 : 0;
  const yBedMax = isCenter ? bedH / 2 : bedH;
  const xTicks = makeTicks(sxToMm(R), sxToMm(xTickEdge), xBedMin, xBedMax);
  const yTicks = makeTicks(
    syToMm(yStripTopY),
    syToMm(yStripBotY),
    yBedMin,
    yBedMax,
  );

  // ── Visuals ───────────────────────────────────────────────────────────────
  const TICK_COL = "#2a5a8a";
  const LABEL_COL = "#7090b0";
  const ORIGIN_COL = "#e94560";
  const BG = "#0d1520";
  const FONT = 9;
  const MAJOR_LEN = Math.round(R * 0.4);
  const MINOR_LEN = Math.round(R * 0.2);

  // Origin dot — visible in the canvas area (between the ruler strips)
  const originSx = mmToSx(0);
  const originSy = mmToSy(0);
  const originVisible =
    originSx >= R &&
    originSx <= containerW - R &&
    originSy >= yStripTopY &&
    originSy <= yStripBotY;

  // Corner square position
  const cornerX = isRight ? containerW - R : 0;
  const cornerY = isBottom || isCenter ? containerH - R : 0;

  // X separator spans between the Y strips
  const xSepX1 = isRight ? 0 : R;
  const xSepX2 = isRight ? containerW - R : containerW;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: containerW,
        height: containerH,
        overflow: "hidden",
        zIndex: 15,
      }}
      pointerEvents="none"
    >
      {/* ── Strip backgrounds ─────────────────────────────────────────────── */}
      <rect
        x={xSepX1}
        y={isBottom || isCenter ? containerH - R : 0}
        width={xSepX2 - xSepX1}
        height={R}
        fill={BG}
      />
      <rect
        x={yStripEdgeX}
        y={yStripTopY}
        width={R}
        height={yStripBotY - yStripTopY}
        fill={BG}
      />
      <rect x={cornerX} y={cornerY} width={R} height={R} fill={BG} />

      {/* ── Separator lines ───────────────────────────────────────────────── */}
      <line
        x1={xSepX1}
        y1={xSepY}
        x2={xSepX2}
        y2={xSepY}
        stroke={TICK_COL}
        strokeWidth={0.5}
      />
      <line
        x1={ySepX}
        y1={yStripTopY}
        x2={ySepX}
        y2={yStripBotY}
        stroke={TICK_COL}
        strokeWidth={0.5}
      />

      {/* ── X ticks ───────────────────────────────────────────────────────── */}
      {xTicks.map((mm) => {
        const sx = mmToSx(mm);
        if (sx < R || sx > xTickEdge) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        return (
          <g key={`rx-${mm}`}>
            <line
              x1={sx}
              y1={xSepY}
              x2={sx}
              y2={xSepY + xTickDir * tLen}
              stroke={col}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                x={sx}
                y={xLabelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={mm === 0 ? ORIGIN_COL : LABEL_COL}
                fontSize={FONT}
                fontFamily="monospace"
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Y ticks ───────────────────────────────────────────────────────── */}
      {yTicks.map((mm) => {
        const sy = mmToSy(mm);
        if (sy < yStripTopY || sy > yStripBotY) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        return (
          <g key={`ry-${mm}`}>
            <line
              x1={ySepX}
              y1={sy}
              x2={ySepX + yTickDir * tLen}
              y2={sy}
              stroke={col}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                transform={`rotate(-90, ${yLabelX}, ${sy})`}
                x={yLabelX}
                y={sy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={mm === 0 ? ORIGIN_COL : LABEL_COL}
                fontSize={FONT}
                fontFamily="monospace"
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Origin dot ────────────────────────────────────────────────────── */}
      {originVisible && (
        <circle
          cx={originSx}
          cy={originSy}
          r={3}
          fill={ORIGIN_COL}
          opacity={0.9}
        />
      )}
    </svg>
  );
}

// ─── Per-import SVG layer with scale + rotation handles ──────────────────────

const ROTATE_OFFSET = 24; // SVG px above the top-centre edge of bounding box

interface ImportLayerProps {
  imp: SvgImport;
  selected: boolean;
  onImportMouseDown: (e: React.MouseEvent, id: string) => void;
  onHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    id: string,
    h: HandlePos,
  ) => void;
  onRotateHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    id: string,
    cxSvg: number,
    cySvg: number,
  ) => void;
  onDelete: () => void;
  getBedY: (mm: number) => number;
}

function ImportLayer({
  imp,
  selected,
  onImportMouseDown,
  onHandleMouseDown,
  onRotateHandleMouseDown,
  onDelete,
  getBedY,
}: ImportLayerProps) {
  const s = imp.scale * MM_TO_PX;
  const vbX = imp.viewBoxX ?? 0;
  const vbY = imp.viewBoxY ?? 0;
  const left = PAD + imp.x * MM_TO_PX;
  const top = getBedY(imp.y + imp.svgHeight * imp.scale);
  const bboxW = imp.svgWidth * s;
  const bboxH = imp.svgHeight * s;

  // Centre of the (unrotated) bounding box in SVG canvas coords
  const cxSvg = left + bboxW / 2;
  const cySvg = top + bboxH / 2;
  const deg = imp.rotation ?? 0;
  const hw = bboxW / 2;
  const hh = bboxH / 2;

  // Rotate an offset (ox, oy) by `deg` degrees around the origin
  const rotPt = (ox: number, oy: number): [number, number] => {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r);
    const ss = Math.sin(r);
    return [ox * c - oy * ss, ox * ss + oy * c];
  };

  // group transform: centre → rotate → scale → offset to SVG user-unit centre
  const groupTransform = [
    `translate(${cxSvg}, ${cySvg})`,
    `rotate(${deg})`,
    `scale(${s})`,
    `translate(${-(vbX + imp.svgWidth / 2)}, ${-(vbY + imp.svgHeight / 2)})`,
  ].join(" ");

  // 8 scale handles at rotated positions
  const mkHandle = (ox: number, oy: number): [number, number] => {
    const [dx, dy] = rotPt(ox, oy);
    return [cxSvg + dx, cySvg + dy];
  };
  const handleCoords: Record<HandlePos, [number, number]> = {
    tl: mkHandle(-hw, -hh),
    t: mkHandle(0, -hh),
    tr: mkHandle(hw, -hh),
    r: mkHandle(hw, 0),
    br: mkHandle(hw, hh),
    b: mkHandle(0, hh),
    bl: mkHandle(-hw, hh),
    l: mkHandle(-hw, 0),
  };

  const cursorMap: Record<HandlePos, string> = {
    tl: "nwse-resize",
    t: "ns-resize",
    tr: "nesw-resize",
    r: "ew-resize",
    br: "nwse-resize",
    b: "ns-resize",
    bl: "nesw-resize",
    l: "ew-resize",
  };

  // Rotation handle — above the top-centre edge
  const [rhdx, rhdy] = rotPt(0, -hh - ROTATE_OFFSET);
  const rotHandleX = cxSvg + rhdx;
  const rotHandleY = cySvg + rhdy;
  const [topCdx, topCdy] = rotPt(0, -hh);
  const topCentreX = cxSvg + topCdx;
  const topCentreY = cySvg + topCdy;

  // Delete button — offset from rotated top-right corner
  const [trDx, trDy] = rotPt(hw, -hh);
  const delCx = cxSvg + trDx + 14;
  const delCy = cySvg + trDy - 14;

  return (
    <g>
      {/* Draggable group */}
      <g
        transform={groupTransform}
        onMouseDown={(e) => onImportMouseDown(e, imp.id)}
        style={{ cursor: "grab" }}
      >
        {imp.paths
          .filter((p) => p.visible)
          .map((p) => (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              stroke={selected ? "#60a0ff" : "#3a6aaa"}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {/* Hit-test rect covering the whole viewBox */}
        <rect
          x={vbX}
          y={vbY}
          width={imp.svgWidth}
          height={imp.svgHeight}
          fill="transparent"
        />
      </g>

      {/* Bounding box — rotated around its centre */}
      {selected && (
        <rect
          x={left}
          y={top}
          width={bboxW}
          height={bboxH}
          fill="none"
          stroke="#e94560"
          strokeWidth={1}
          strokeDasharray="4 2"
          transform={`rotate(${deg}, ${cxSvg}, ${cySvg})`}
          pointerEvents="none"
        />
      )}

      {/* Scale handles at rotated positions */}
      {selected &&
        ALL_HANDLES.map((h) => {
          const [hx, hy] = handleCoords[h];
          return (
            <circle
              key={h}
              cx={hx}
              cy={hy}
              r={HANDLE_R}
              fill="#16213e"
              stroke="#e94560"
              strokeWidth={1.5}
              style={{ cursor: cursorMap[h] }}
              onMouseDown={(e) => onHandleMouseDown(e, imp.id, h)}
            />
          );
        })}

      {/* Rotation handle — stem line + circle above top-centre edge */}
      {selected && (
        <>
          <line
            x1={topCentreX}
            y1={topCentreY}
            x2={rotHandleX}
            y2={rotHandleY}
            stroke="#e94560"
            strokeWidth={1}
            pointerEvents="none"
          />
          <circle
            cx={rotHandleX}
            cy={rotHandleY}
            r={HANDLE_R}
            fill="#e94560"
            stroke="#fff"
            strokeWidth={1.5}
            style={{ cursor: ROTATE_CURSOR }}
            onMouseDown={(e) =>
              onRotateHandleMouseDown(e, imp.id, cxSvg, cySvg)
            }
          />
        </>
      )}

      {/* Delete button */}
      {selected && (
        <g
          transform={`translate(${delCx}, ${delCy})`}
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <svg
            x={-9}
            y={-9}
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect
              width="18"
              height="18"
              x="3"
              y="3"
              rx="2"
              ry="2"
              fill="#e94560"
              stroke="none"
            />
            <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
            <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
          </svg>
        </g>
      )}
    </g>
  );
}
