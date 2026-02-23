import { useRef, useEffect, useState, useCallback } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import type { VectorObject } from "../../../types";

const MM_TO_PX = 3; // display scale: 3px per mm
const HANDLE_R = 5;  // handle radius in SVG pixels

// Handle positions: top-left, top, top-right, right, bottom-right, bottom, bottom-left, left
type HandlePos = "tl"|"t"|"tr"|"r"|"br"|"b"|"bl"|"l";
const ALL_HANDLES: HandlePos[] = ["tl","t","tr","r","br","b","bl","l"];

export function PlotCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const objects = useCanvasStore((s) => s.objects);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectObject = useCanvasStore((s) => s.selectObject);
  const updateObject = useCanvasStore((s) => s.updateObject);
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
    if (!toolpathSelected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        setGcodeToolpath(null);
        setToolpathSelected(false);
      } else if (e.key === "Escape") {
        setToolpathSelected(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toolpathSelected, setGcodeToolpath]);

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
  const onObjMouseDown = useCallback(
    (e: React.MouseEvent<SVGGElement>, id: string) => {
      e.stopPropagation();
      selectObject(id);
      const obj = useCanvasStore.getState().objects.find((o) => o.id === id);
      if (!obj) return;
      setDragging({
        id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startObjX: obj.x,
        startObjY: obj.y,
      });
    },
    [selectObject],
  );

  // ── Scale handle mouse down ────────────────────────────────────────────────────
  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, id: string, handle: HandlePos) => {
      e.stopPropagation();
      const obj = useCanvasStore.getState().objects.find((o) => o.id === id);
      if (!obj) return;
      setScaling({
        id,
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startScale: obj.scale,
        startObjX: obj.x,
        startObjY: obj.y,
        startW: obj.originalWidth * obj.scale * MM_TO_PX,
        startH: obj.originalHeight * obj.scale * MM_TO_PX,
      });
    },
    [],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragging && svgRef.current) {
        const obj = useCanvasStore.getState().objects.find((o) => o.id === dragging.id);
        if (!obj) return;
        const dx = (e.clientX - dragging.startMouseX) / MM_TO_PX;
        const dy = -(e.clientY - dragging.startMouseY) / MM_TO_PX;
        updateObject(dragging.id, {
          x: Math.max(0, Math.min(dragging.startObjX + dx, bedW)),
          y: Math.max(0, Math.min(dragging.startObjY + dy, bedH)),
        });
      }

      if (scaling) {
        const obj = useCanvasStore.getState().objects.find((o) => o.id === scaling.id);
        if (!obj) return;

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
        updateObject(scaling.id, { scale: newScale });
      }
    },
    [dragging, scaling, bedW, bedH, updateObject],
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
        onClick={() => { selectObject(null); setToolpathSelected(false); }}
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
                    onClick={(e) => { e.stopPropagation(); selectObject(null); setToolpathSelected(true); }}
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

        {/* Vector objects */}
        {objects.filter((o) => o.visible).map((obj) => (
          <VectorLayer key={obj.id} obj={obj}
            selected={selectedId === obj.id}
            onObjMouseDown={onObjMouseDown}
            onHandleMouseDown={onHandleMouseDown}
            getBedY={getBedY} />
        ))}
      </svg>
    </div>
  );
}

// ─── Per-object SVG layer with scale handles ──────────────────────────────────

interface VectorLayerProps {
  obj: VectorObject;
  selected: boolean;
  onObjMouseDown: (e: React.MouseEvent<SVGGElement>, id: string) => void;
  onHandleMouseDown: (e: React.MouseEvent<SVGCircleElement>, id: string, h: HandlePos) => void;
  getBedY: (mm: number) => number;
}

function VectorLayer({ obj, selected, onObjMouseDown, onHandleMouseDown, getBedY }: VectorLayerProps) {
  // Top-left corner of the object in SVG space
  const svgX = 20 + obj.x * MM_TO_PX;
  const svgY = getBedY(obj.y) - obj.originalHeight * obj.scale * MM_TO_PX;
  const wPx = obj.originalWidth * obj.scale * MM_TO_PX;
  const hPx = obj.originalHeight * obj.scale * MM_TO_PX;

  // Handle positions in SVG coordinates (outside the per-object transform)
  const handleCoords: Record<HandlePos, [number, number]> = {
    tl: [svgX,          svgY],
    t:  [svgX + wPx/2,  svgY],
    tr: [svgX + wPx,    svgY],
    r:  [svgX + wPx,    svgY + hPx/2],
    br: [svgX + wPx,    svgY + hPx],
    b:  [svgX + wPx/2,  svgY + hPx],
    bl: [svgX,          svgY + hPx],
    l:  [svgX,          svgY + hPx/2],
  };

  const cursorMap: Record<HandlePos, string> = {
    tl: "nwse-resize", t: "ns-resize",  tr: "nesw-resize",
    r:  "ew-resize",   br: "nwse-resize", b: "ns-resize",
    bl: "nesw-resize", l: "ew-resize",
  };

  return (
    <g>
      {/* Draggable object body */}
      <g
        transform={`translate(${svgX}, ${svgY}) scale(${obj.scale * MM_TO_PX}) rotate(${-obj.rotation})`}
        onMouseDown={(e) => onObjMouseDown(e, obj.id)}
        style={{ cursor: "grab" }}
      >
        <g
          dangerouslySetInnerHTML={{ __html: obj.svgSource }}
          style={{ fill: "none", stroke: selected ? "#e94560" : "#60a0ff", strokeWidth: 0.5 }}
        />
      </g>

      {/* Selection rect + scale handles — rendered at SVG root level so handles are always same pixel size */}
      {selected && (
        <g>
          {/* Dashed bounding rect */}
          <rect
            x={svgX} y={svgY} width={wPx} height={hPx}
            fill="none" stroke="#e94560" strokeWidth={1} strokeDasharray="4 2"
            pointerEvents="none"
          />

          {/* Scale handles */}
          {ALL_HANDLES.map((h) => {
            const [hx, hy] = handleCoords[h];
            return (
              <circle
                key={h}
                cx={hx} cy={hy} r={HANDLE_R}
                fill="#16213e" stroke="#e94560" strokeWidth={1.5}
                style={{ cursor: cursorMap[h] }}
                onMouseDown={(e) => onHandleMouseDown(e, obj.id, h)}
              />
            );
          })}
        </g>
      )}
    </g>
  );
}
