import { useRef, useEffect, useState, useCallback } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import type { SvgImport } from "../../../types";

const MM_TO_PX = 3; // display scale: 3px per mm
const HANDLE_R = 5;  // handle radius in SVG pixels

// Handle positions: top-left, top, top-right, right, bottom-right, bottom, bottom-left, left
type HandlePos = "tl"|"t"|"tr"|"r"|"br"|"b"|"bl"|"l";
const ALL_HANDLES: HandlePos[] = ["tl","t","tr","r","br","b","bl","l"];

export function PlotCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
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

  // ── Drag state (move) ────────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startObjX: number;
    startObjY: number;
  } | null>(null);

  // ── Scale state ───────────────────────────────────────────────────────────────
  const [scaling, setScaling] = useState<{
    id: string;
    handle: HandlePos;
    startMouseX: number;
    startMouseY: number;
    startScale: number;
    startObjX: number;
    startObjY: number;
    startW: number;  // px
    startH: number;
  } | null>(null);

  // ── Toolpath selection ────────────────────────────────────────────────────────
  const [toolpathSelected, setToolpathSelected] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedImportId) {
          removeImport(selectedImportId);
        } else if (toolpathSelected) {
          setGcodeToolpath(null);
          setToolpathSelected(false);
        }
      } else if (e.key === "Escape") {
        selectImport(null);
        setToolpathSelected(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedImportId, toolpathSelected, removeImport, selectImport, setGcodeToolpath]);

  // Clear toolpath selection when toolpath is removed
  useEffect(() => {
    if (!gcodeToolpath) setToolpathSelected(false);
  }, [gcodeToolpath]);

  const canvasW = bedW * MM_TO_PX + 40;
  const canvasH = bedH * MM_TO_PX + 40;

  // Convert SVG pixel position to bed mm
  const toMM = (pxX: number, pxY: number) => ({
    x: Math.round(((pxX - 20) / MM_TO_PX) * 1000) / 1000,
    y: Math.round(((canvasH - 20 - pxY) / MM_TO_PX) * 1000) / 1000,
  });

  // Convert bed mm Y to SVG pixel Y (origin flip)
  const getBedY = (mmY: number) => canvasH - 20 - mmY * MM_TO_PX;

  // ── Drag handlers ─────────────────────────────────────────────────────────────
  const onImportMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
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

  // ── Scale handle mouse down ────────────────────────────────────────────────────
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

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragging && svgRef.current) {
        const imp = useCanvasStore.getState().imports.find((i) => i.id === dragging.id);
        if (!imp) return;
        const dx = (e.clientX - dragging.startMouseX) / MM_TO_PX;
        const dy = -(e.clientY - dragging.startMouseY) / MM_TO_PX;
        updateImport(dragging.id, {
          x: Math.max(0, Math.min(dragging.startObjX + dx, bedW)),
          y: Math.max(0, Math.min(dragging.startObjY + dy, bedH)),
        });
      }

      if (scaling) {
        const imp = useCanvasStore.getState().imports.find((i) => i.id === scaling.id);
        if (!imp) return;

        const dx = e.clientX - scaling.startMouseX;
        const dy = e.clientY - scaling.startMouseY;
        const h = scaling.handle;

        // Determine the dominant drag axis based on handle position
        let delta = 0;
        if (h === "tl" || h === "bl") delta = -dx;
        else if (h === "tr" || h === "br") delta = dx;
        else if (h === "t") delta = -dy;
        else if (h === "b") delta = dy;
        else if (h === "r") delta = dx;
        else if (h === "l") delta = -dx;

        const dimPx = h === "t" || h === "b" ? scaling.startH : scaling.startW;
        const newScale = Math.max(0.05, scaling.startScale * (1 + delta / dimPx));
        updateImport(scaling.id, { scale: newScale });
      }
    },
    [dragging, scaling, bedW, bedH, updateImport],
  );

  const onMouseUp = useCallback(() => {
    setDragging(null);
    setScaling(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div className="w-full h-full overflow-auto bg-[#1a1a2e] flex items-center justify-center p-4">
      <svg
        ref={svgRef}
        width={canvasW}
        height={canvasH}
        className="cursor-default select-none"
        onClick={() => { selectImport(null); setToolpathSelected(false); }}
      >
        {/* Bed background */}
        <rect x={20} y={20} width={bedW * MM_TO_PX} height={bedH * MM_TO_PX}
          fill="#0d1117" stroke="#0f3460" strokeWidth={1} />

        {/* Grid lines — 10 mm intervals */}
        {Array.from({ length: Math.floor(bedW / 10) + 1 }, (_, i) => i * 10).map((mm) => (
          <line key={`vg-${mm}`}
            x1={20 + mm * MM_TO_PX} y1={20}
            x2={20 + mm * MM_TO_PX} y2={20 + bedH * MM_TO_PX}
            stroke="#0f3460" strokeWidth={mm % 50 === 0 ? 0.8 : 0.3} />
        ))}
        {Array.from({ length: Math.floor(bedH / 10) + 1 }, (_, i) => i * 10).map((mm) => (
          <line key={`hg-${mm}`}
            x1={20} y1={getBedY(mm)}
            x2={20 + bedW * MM_TO_PX} y2={getBedY(mm)}
            stroke="#0f3460" strokeWidth={mm % 50 === 0 ? 0.8 : 0.3} />
        ))}

        {/* Origin marker */}
        <circle cx={20} cy={20 + bedH * MM_TO_PX} r={4} fill="#e94560" />
        <text x={22} y={canvasH - 4} fill="#4a5568" fontSize={9}>0,0</text>
        <text x={20 + bedW * MM_TO_PX - 20} y={canvasH - 4} fill="#4a5568" fontSize={9}>
          {bedW}mm
        </text>

        {/* G-code toolpath overlay */}
        {gcodeToolpath && (() => {
          const { minX, maxX, minY, maxY } = gcodeToolpath.bounds;
          const svgLeft   = 20 + minX * MM_TO_PX;
          const svgRight  = 20 + maxX * MM_TO_PX;
          const svgTop    = 20 + (bedH - maxY) * MM_TO_PX;
          const svgBottom = 20 + (bedH - minY) * MM_TO_PX;
          const bboxW = svgRight - svgLeft;
          const bboxH = svgBottom - svgTop;
          const delCx = svgRight + 8;
          const delCy = svgTop - 8;
          return (
            <>
              <g transform={`translate(${20}, ${20 + bedH * MM_TO_PX}) scale(${MM_TO_PX}, ${-MM_TO_PX})`}>
                <clipPath id="bed-clip">
                  <rect x={0} y={0} width={bedW} height={bedH} />
                </clipPath>
                <g clipPath="url(#bed-clip)">
                  {gcodeToolpath.rapids && (
                    <path
                      d={gcodeToolpath.rapids}
                      stroke="#4a5568" strokeWidth={0.5} fill="none"
                      strokeDasharray="2 1"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {gcodeToolpath.cuts && (
                    <path
                      d={gcodeToolpath.cuts}
                      stroke={toolpathSelected ? "#38bdf8" : "#0ea5e9"} strokeWidth={1.5} fill="none"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {/* Invisible hit area for clicking the toolpath */}
                  <rect
                    x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                    fill="transparent" style={{ cursor: "pointer" }}
                    vectorEffect="non-scaling-stroke"
                    onClick={(e) => { e.stopPropagation(); selectImport(null); setToolpathSelected(true); }}
                  />
                </g>
              </g>

              {/* Bounding box + delete button — rendered in SVG root coords */}
              {toolpathSelected && (
                <g pointerEvents="none">
                  <rect
                    x={svgLeft} y={svgTop} width={bboxW} height={bboxH}
                    fill="none" stroke="#38bdf8" strokeWidth={1} strokeDasharray="5 3"
                  />
                  {/* Corner ticks */}
                  {[[svgLeft, svgTop], [svgRight, svgTop], [svgLeft, svgBottom], [svgRight, svgBottom]].map(([cx, cy], i) => (
                    <circle key={i} cx={cx} cy={cy} r={2.5} fill="#38bdf8" />
                  ))}
                </g>
              )}
              {toolpathSelected && (
                <g
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setGcodeToolpath(null); }}
                >
                  <circle cx={delCx} cy={delCy} r={8} fill="#e94560" />
                  <text x={delCx} y={delCy} textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize={11} fontWeight="bold" style={{ userSelect: "none" }}
                  >×</text>
                </g>
              )}
            </>
          );
        })()}

        {/* SVG imports */}
        {imports.filter((imp) => imp.visible).map((imp) => (
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
  );
}

// ─── Per-import SVG layer with scale handles ──────────────────────────────────

interface ImportLayerProps {
  imp: SvgImport;
  selected: boolean;
  onImportMouseDown: (e: React.MouseEvent, id: string) => void;
  onHandleMouseDown: (e: React.MouseEvent<SVGCircleElement>, id: string, h: HandlePos) => void;
  onDelete: () => void;
  getBedY: (mm: number) => number;
}

function ImportLayer({ imp, selected, onImportMouseDown, onHandleMouseDown, onDelete, getBedY }: ImportLayerProps) {
  const s     = imp.scale * MM_TO_PX;
  const vbX   = imp.viewBoxX ?? 0;
  const vbY   = imp.viewBoxY ?? 0;
  const left  = 20 + imp.x * MM_TO_PX;
  const top   = getBedY(imp.y + imp.svgHeight * imp.scale);
  const bboxW = imp.svgWidth * s;
  const bboxH = imp.svgHeight * s;
  const right  = left + bboxW;
  const bottom = top + bboxH;

  // group transform: maps SVG (vbX, vbY) → canvas (left, top)
  const groupTransform = `translate(${left - vbX * s}, ${top - vbY * s}) scale(${s})`;

  const handleCoords: Record<HandlePos, [number, number]> = {
    tl: [left,          top],
    t:  [left + bboxW/2, top],
    tr: [right,          top],
    r:  [right,          top + bboxH/2],
    br: [right,          bottom],
    b:  [left + bboxW/2, bottom],
    bl: [left,           bottom],
    l:  [left,           top + bboxH/2],
  };

  const cursorMap: Record<HandlePos, string> = {
    tl: "nwse-resize", t: "ns-resize",  tr: "nesw-resize",
    r:  "ew-resize",   br: "nwse-resize", b: "ns-resize",
    bl: "nesw-resize", l: "ew-resize",
  };

  const delCx = right + 12;
  const delCy = top - 12;

  return (
    <g>
      {/* Draggable group — all paths rendered in SVG coordinate space */}
      <g
        transform={groupTransform}
        onMouseDown={(e) => onImportMouseDown(e, imp.id)}
        style={{ cursor: "grab" }}
      >
        {imp.paths.filter((p) => p.visible).map((p) => (
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
          x={vbX} y={vbY}
          width={imp.svgWidth} height={imp.svgHeight}
          fill="transparent"
        />
      </g>

      {/* Bounding box */}
      {selected && (
        <rect
          x={left} y={top} width={bboxW} height={bboxH}
          fill="none" stroke="#e94560" strokeWidth={1} strokeDasharray="4 2"
          pointerEvents="none"
        />
      )}

      {/* Scale handles */}
      {selected && ALL_HANDLES.map((h) => {
        const [hx, hy] = handleCoords[h];
        return (
          <circle
            key={h}
            cx={hx} cy={hy} r={HANDLE_R}
            fill="#16213e" stroke="#e94560" strokeWidth={1.5}
            style={{ cursor: cursorMap[h] }}
            onMouseDown={(e) => onHandleMouseDown(e, imp.id, h)}
          />
        );
      })}

      {/* Delete button */}
      {selected && (
        <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <circle cx={delCx} cy={delCy} r={9} fill="#e94560" />
          <text x={delCx} y={delCy} textAnchor="middle" dominantBaseline="central"
            fill="white" fontSize={12} fontWeight="bold" style={{ userSelect: "none" }}
          >×</text>
        </g>
      )}
    </g>
  );
}
