import { useRef, useEffect, useState, useCallback } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import type { SvgImport } from "../../../types";

const MM_TO_PX = 3; // internal SVG scale: 3 px per mm
const HANDLE_R = 5; // handle radius in SVG pixels
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1.25; // per keyboard / button press

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

  const canvasW = bedW * MM_TO_PX + 40;
  const canvasH = bedH * MM_TO_PX + 40;

  // ── Viewport state ────────────────────────────────────────────────────────────
  // vpRef mirrors vp for use inside event-handler closures without stale captures.
  const [vp, _setVp] = useState<Vp>({ zoom: 1, panX: 0, panY: 0 });
  const vpRef = useRef<Vp>(vp);
  const setVp = useCallback((next: Vp) => {
    vpRef.current = next;
    _setVp(next);
  }, []);

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
      const pad = 32;
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

  // ── SVG coordinate helpers ────────────────────────────────────────────────────
  const getBedY = (mmY: number) => canvasH - 20 - mmY * MM_TO_PX;

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
        updateImport(dragging.id, {
          x: Math.max(0, Math.min(dragging.startObjX + dx, bedW)),
          y: Math.max(0, Math.min(dragging.startObjY + dy, bedH)),
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
        const newScale = Math.max(
          0.05,
          scaling.startScale * (1 + delta / dimPx),
        );
        updateImport(scaling.id, { scale: newScale });
      }
    },
    [dragging, scaling, bedW, bedH, updateImport, setVp, setFitted],
  );

  const onMouseUp = useCallback(() => {
    setDragging(null);
    setScaling(null);
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
            x={20}
            y={20}
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
              x1={20 + mm * MM_TO_PX}
              y1={20}
              x2={20 + mm * MM_TO_PX}
              y2={20 + bedH * MM_TO_PX}
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
              x1={20}
              y1={getBedY(mm)}
              x2={20 + bedW * MM_TO_PX}
              y2={getBedY(mm)}
              stroke="#0f3460"
              strokeWidth={mm % 50 === 0 ? 0.8 : 0.3}
            />
          ))}

          {/* Rulers + origin marker */}
          <Rulers
            bedW={bedW}
            bedH={bedH}
            origin={config?.origin ?? "bottom-left"}
            canvasH={canvasH}
          />

          {/* G-code toolpath overlay */}
          {gcodeToolpath &&
            (() => {
              const { minX, maxX, minY, maxY } = gcodeToolpath.bounds;
              const svgLeft = 20 + minX * MM_TO_PX;
              const svgRight = 20 + maxX * MM_TO_PX;
              const svgTop = 20 + (bedH - maxY) * MM_TO_PX;
              const svgBottom = 20 + (bedH - minY) * MM_TO_PX;
              const bboxW = svgRight - svgLeft;
              const bboxH = svgBottom - svgTop;
              const delCx = svgRight + 8;
              const delCy = svgTop - 8;
              return (
                <>
                  <g
                    transform={`translate(${20}, ${20 + bedH * MM_TO_PX}) scale(${MM_TO_PX}, ${-MM_TO_PX})`}
                  >
                    <clipPath id="bed-clip">
                      <rect x={0} y={0} width={bedW} height={bedH} />
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
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setGcodeToolpath(null);
                      }}
                    >
                      <circle cx={delCx} cy={delCy} r={8} fill="#e94560" />
                      <text
                        x={delCx}
                        y={delCy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize={11}
                        fontWeight="bold"
                        style={{ userSelect: "none" }}
                      >
                        ×
                      </text>
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
                onDelete={() => removeImport(imp.id)}
                getBedY={getBedY}
              />
            ))}
        </svg>
      </div>

      {/* ── Zoom / pan overlay controls ───────────────────────────────────── */}
      <div
        className="absolute bottom-4 right-4 flex flex-col gap-1 z-10"
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

// ─── Rulers ──────────────────────────────────────────────────────────────────

interface RulerProps {
  bedW: number;
  bedH: number;
  origin: "bottom-left" | "top-left";
  canvasH: number;
}

function Rulers({ bedW, bedH, origin, canvasH }: RulerProps) {
  const isBottomLeft = origin !== "top-left";

  // Bed corners in SVG space
  const bedLeft = 20;
  const bedTop = 20;
  const bedBottom = 20 + bedH * MM_TO_PX;

  // X ruler: sits on the bed edge where Y=0 lives
  const xBaseY = isBottomLeft ? bedBottom : bedTop;
  const xTickDir = isBottomLeft ? 1 : -1; // +1 = tick goes downward (into bottom margin)

  // Y ruler: always on the left edge; origin value is at xBaseY
  // svgY for a given mm value along the Y axis:
  const ySvgOfMm = (mm: number) =>
    isBottomLeft ? bedBottom - mm * MM_TO_PX : bedTop + mm * MM_TO_PX;

  const MINOR_LEN = 4; // px, 10 mm ticks
  const MAJOR_LEN = 8; // px, 50 mm ticks
  const LABEL_GAP = 2; // gap between tick end and label
  const FONT = 7;
  const TICK_COLOR = "#1e406a";
  const LABEL_COLOR = "#4a6080";
  const LINE_COLOR = "#1a3060";

  const xTicks = Array.from(
    { length: Math.floor(bedW / 10) + 1 },
    (_, i) => i * 10,
  );
  const yTicks = Array.from(
    { length: Math.floor(bedH / 10) + 1 },
    (_, i) => i * 10,
  );

  return (
    <g pointerEvents="none">
      {/* ── X ruler ──────────────────────────────────────────────────────── */}
      <line
        x1={bedLeft}
        y1={xBaseY}
        x2={bedLeft + bedW * MM_TO_PX}
        y2={xBaseY}
        stroke={LINE_COLOR}
        strokeWidth={0.5}
      />
      {xTicks.map((mm) => {
        const x = bedLeft + mm * MM_TO_PX;
        const isMajor = mm % 50 === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const y2 = xBaseY + xTickDir * tLen;
        return (
          <g key={`xt-${mm}`}>
            <line
              x1={x}
              y1={xBaseY}
              x2={x}
              y2={y2}
              stroke={TICK_COLOR}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                x={x}
                y={y2 + xTickDir * LABEL_GAP}
                textAnchor="middle"
                dominantBaseline={isBottomLeft ? "hanging" : "auto"}
                fill={mm === 0 ? "#e94560" : LABEL_COLOR}
                fontSize={FONT}
                fontWeight={mm === 0 ? "bold" : "normal"}
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Y ruler ──────────────────────────────────────────────────────── */}
      <line
        x1={bedLeft}
        y1={bedTop}
        x2={bedLeft}
        y2={bedBottom}
        stroke={LINE_COLOR}
        strokeWidth={0.5}
      />
      {yTicks.map((mm) => {
        const y = ySvgOfMm(mm);
        const isMajor = mm % 50 === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        return (
          <g key={`yt-${mm}`}>
            <line
              x1={bedLeft}
              y1={y}
              x2={bedLeft - tLen}
              y2={y}
              stroke={TICK_COLOR}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                x={bedLeft - tLen - LABEL_GAP}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill={mm === 0 ? "#e94560" : LABEL_COLOR}
                fontSize={FONT}
                fontWeight={mm === 0 ? "bold" : "normal"}
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Origin dot ───────────────────────────────────────────────────── */}
      <circle cx={bedLeft} cy={xBaseY} r={3.5} fill="#e94560" />

      {/* ── Far-end dimension label ───────────────────────────────────────── */}
      <text
        x={bedLeft + bedW * MM_TO_PX}
        y={xBaseY + xTickDir * (MAJOR_LEN + LABEL_GAP)}
        textAnchor="end"
        dominantBaseline={isBottomLeft ? "hanging" : "auto"}
        fill={LABEL_COLOR}
        fontSize={FONT}
      >
        {bedW} mm
      </text>
      <text
        x={bedLeft - MAJOR_LEN - LABEL_GAP}
        y={isBottomLeft ? bedTop : bedBottom}
        textAnchor="end"
        dominantBaseline={isBottomLeft ? "hanging" : "auto"}
        fill={LABEL_COLOR}
        fontSize={FONT}
      >
        {bedH} mm
      </text>
    </g>
  );
}

// ─── Per-import SVG layer with scale handles ──────────────────────────────────

interface ImportLayerProps {
  imp: SvgImport;
  selected: boolean;
  onImportMouseDown: (e: React.MouseEvent, id: string) => void;
  onHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    id: string,
    h: HandlePos,
  ) => void;
  onDelete: () => void;
  getBedY: (mm: number) => number;
}

function ImportLayer({
  imp,
  selected,
  onImportMouseDown,
  onHandleMouseDown,
  onDelete,
  getBedY,
}: ImportLayerProps) {
  const s = imp.scale * MM_TO_PX;
  const vbX = imp.viewBoxX ?? 0;
  const vbY = imp.viewBoxY ?? 0;
  const left = 20 + imp.x * MM_TO_PX;
  const top = getBedY(imp.y + imp.svgHeight * imp.scale);
  const bboxW = imp.svgWidth * s;
  const bboxH = imp.svgHeight * s;
  const right = left + bboxW;
  const bottom = top + bboxH;

  // group transform: maps SVG (vbX, vbY) → canvas (left, top)
  const groupTransform = `translate(${left - vbX * s}, ${top - vbY * s}) scale(${s})`;

  const handleCoords: Record<HandlePos, [number, number]> = {
    tl: [left, top],
    t: [left + bboxW / 2, top],
    tr: [right, top],
    r: [right, top + bboxH / 2],
    br: [right, bottom],
    b: [left + bboxW / 2, bottom],
    bl: [left, bottom],
    l: [left, top + bboxH / 2],
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

  const delCx = right + 12;
  const delCy = top - 12;

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

      {/* Bounding box */}
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
          pointerEvents="none"
        />
      )}

      {/* Scale handles */}
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

      {/* Delete button */}
      {selected && (
        <g
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <circle cx={delCx} cy={delCy} r={9} fill="#e94560" />
          <text
            x={delCx}
            y={delCy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={12}
            fontWeight="bold"
            style={{ userSelect: "none" }}
          >
            ×
          </text>
        </g>
      )}
    </g>
  );
}
