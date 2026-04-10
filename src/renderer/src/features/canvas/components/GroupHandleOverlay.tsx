import { type SvgImport } from "../../../../../types";
import { HANDLE_SCREEN_R, MM_TO_PX, PAD, ROTATE_CURSOR } from "../constants";
import type { HandlePos } from "../types";
import { DeleteActionBadge } from "./DeleteActionBadge";

interface GroupHandleOverlayProps {
  imports: SvgImport[];
  zoom: number;
  panX: number;
  panY: number;
  containerW: number;
  containerH: number;
  getBedY: (mm: number) => number;
  onGroupMouseDown: (e: React.MouseEvent<SVGRectElement>) => void;
  onGroupHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    handle: HandlePos,
  ) => void;
  onGroupRotateHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    gCx: number,
    gCy: number,
    gHW: number,
    gHH: number,
  ) => void;
  onDelete: () => void;
  activeOBB?: {
    gCx: number;
    gCy: number;
    gHW: number;
    gHH: number;
    angle: number;
  };
}

export function GroupHandleOverlay({
  imports,
  zoom,
  panX,
  panY,
  containerW,
  containerH,
  getBedY,
  onGroupMouseDown,
  onGroupHandleMouseDown,
  onGroupRotateHandleMouseDown,
  onDelete,
  activeOBB,
}: GroupHandleOverlayProps) {
  if (imports.length === 0) return null;

  const w2s = (x: number, y: number): [number, number] => [
    x * zoom + panX,
    y * zoom + panY,
  ];

  type HEntry = [HandlePos, number, number];
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

  const ROTATE_STEM_PX = 24;
  const GROUP_DEL_OFFSET_PX = 26;

  if (activeOBB) {
    const { gCx: oCx, gCy: oCy, gHW: oHW, gHH: oHH, angle } = activeOBB;
    const [pivotSx, pivotSy] = w2s(oCx, oCy);
    const hw = oHW * zoom;
    const hh = oHH * zoom;
    const rotHy = pivotSy - hh - ROTATE_STEM_PX;
    const delX = pivotSx + hw + GROUP_DEL_OFFSET_PX * 0.7;
    const delY = pivotSy - hh - GROUP_DEL_OFFSET_PX * 0.7;
    const obbHandles: HEntry[] = [
      ["tl", pivotSx - hw, pivotSy - hh],
      ["t", pivotSx, pivotSy - hh],
      ["tr", pivotSx + hw, pivotSy - hh],
      ["r", pivotSx + hw, pivotSy],
      ["br", pivotSx + hw, pivotSy + hh],
      ["b", pivotSx, pivotSy + hh],
      ["bl", pivotSx - hw, pivotSy + hh],
      ["l", pivotSx - hw, pivotSy],
    ];
    return (
      <svg
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 5,
        }}
        width={containerW}
        height={containerH}
        viewBox={`0 0 ${containerW} ${containerH}`}
      >
        <g transform={`rotate(${angle}, ${pivotSx}, ${pivotSy})`}>
          <rect
            x={pivotSx - hw}
            y={pivotSy - hh}
            width={hw * 2}
            height={hh * 2}
            fill="none"
            stroke="var(--tf-accent)"
            strokeWidth={1}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
          <rect
            x={pivotSx - hw}
            y={pivotSy - hh}
            width={hw * 2}
            height={hh * 2}
            fill="transparent"
            style={{ cursor: "grab", pointerEvents: "all" }}
            onMouseDown={onGroupMouseDown}
          />
          <line
            x1={pivotSx}
            y1={pivotSy - hh}
            x2={pivotSx}
            y2={rotHy}
            stroke="var(--tf-accent)"
            strokeWidth={1}
            pointerEvents="none"
          />
          <circle
            cx={pivotSx}
            cy={rotHy}
            r={HANDLE_SCREEN_R}
            fill="var(--tf-accent)"
            stroke="white"
            strokeWidth={1.5}
            style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
            onMouseDown={(e) =>
              onGroupRotateHandleMouseDown(e, oCx, oCy, oHW, oHH)
            }
          />
          {obbHandles.map(([id, sx, sy]) => (
            <circle
              key={id}
              cx={sx}
              cy={sy}
              r={HANDLE_SCREEN_R}
              fill="white"
              stroke="var(--tf-accent)"
              strokeWidth={1.5}
              style={{ cursor: cursorMap[id], pointerEvents: "all" }}
              onMouseDown={(e) => onGroupHandleMouseDown(e, id)}
            />
          ))}
          <DeleteActionBadge
            dataTestId="group-handle-delete"
            x={delX}
            y={delY}
            onDelete={onDelete}
          />
        </g>
      </svg>
    );
  }

  let minWx = Infinity;
  let maxWx = -Infinity;
  let minWy = Infinity;
  let maxWy = -Infinity;

  for (const imp of imports) {
    const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
    const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
    const left = PAD + imp.x * MM_TO_PX;
    const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
    const bboxW = imp.svgWidth * sX;
    const bboxH = imp.svgHeight * sY;
    const cxSvg = left + bboxW / 2;
    const cySvg = top + bboxH / 2;
    const hw = bboxW / 2;
    const hh = bboxH / 2;
    const rad = ((imp.rotation ?? 0) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    for (const [ox, oy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as [number, number][]) {
      const wx = cxSvg + ox * cosA - oy * sinA;
      const wy = cySvg + ox * sinA + oy * cosA;
      if (wx < minWx) minWx = wx;
      if (wx > maxWx) maxWx = wx;
      if (wy < minWy) minWy = wy;
      if (wy > maxWy) maxWy = wy;
    }
  }

  const BBOX_PAD_W = 6 / zoom;
  minWx -= BBOX_PAD_W;
  maxWx += BBOX_PAD_W;
  minWy -= BBOX_PAD_W;
  maxWy += BBOX_PAD_W;

  const gCx = (minWx + maxWx) / 2;
  const gCy = (minWy + maxWy) / 2;
  const gHW = (maxWx - minWx) / 2;
  const gHH = (maxWy - minWy) / 2;

  const [tlSx, tlSy] = w2s(minWx, minWy);
  const [trSx, trSy] = w2s(maxWx, minWy);
  const [blSx, blSy] = w2s(minWx, maxWy);
  const [tcSx, tcSy] = w2s(gCx, minWy);
  const [bcSx, bcSy] = w2s(gCx, maxWy);
  const [lcSx, lcSy] = w2s(minWx, gCy);
  const [rcSx, rcSy] = w2s(maxWx, gCy);

  const handles: HEntry[] = [
    ["tl", tlSx, tlSy],
    ["t", tcSx, tcSy],
    ["tr", trSx, trSy],
    ["r", rcSx, rcSy],
    ["br", trSx, blSy],
    ["b", bcSx, bcSy],
    ["bl", blSx, blSy],
    ["l", lcSx, lcSy],
  ];

  const rotHx = tcSx;
  const rotHy = tcSy - ROTATE_STEM_PX;

  const delSx = trSx + GROUP_DEL_OFFSET_PX * 0.7;
  const delSy = trSy - GROUP_DEL_OFFSET_PX * 0.7;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 5,
      }}
      width={containerW}
      height={containerH}
      viewBox={`0 0 ${containerW} ${containerH}`}
    >
      <rect
        x={tlSx}
        y={tlSy}
        width={trSx - tlSx}
        height={blSy - tlSy}
        fill="none"
        stroke="var(--tf-accent)"
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />
      <rect
        x={tlSx}
        y={tlSy}
        width={trSx - tlSx}
        height={blSy - tlSy}
        fill="transparent"
        style={{ cursor: "grab", pointerEvents: "all" }}
        onMouseDown={onGroupMouseDown}
      />
      <line
        x1={tcSx}
        y1={tcSy}
        x2={rotHx}
        y2={rotHy}
        stroke="var(--tf-accent)"
        strokeWidth={1}
        pointerEvents="none"
      />
      <circle
        cx={rotHx}
        cy={rotHy}
        r={HANDLE_SCREEN_R}
        fill="var(--tf-accent)"
        stroke="white"
        strokeWidth={1.5}
        style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
        onMouseDown={(e) => onGroupRotateHandleMouseDown(e, gCx, gCy, gHW, gHH)}
      />
      {handles.map(([id, sx, sy]) => (
        <circle
          key={id}
          cx={sx}
          cy={sy}
          r={HANDLE_SCREEN_R}
          fill="white"
          stroke="var(--tf-accent)"
          strokeWidth={1.5}
          style={{ cursor: cursorMap[id], pointerEvents: "all" }}
          onMouseDown={(e) => onGroupHandleMouseDown(e, id)}
        />
      ))}
      <DeleteActionBadge
        dataTestId="group-handle-delete"
        x={delSx}
        y={delSy}
        onDelete={onDelete}
      />
    </svg>
  );
}
