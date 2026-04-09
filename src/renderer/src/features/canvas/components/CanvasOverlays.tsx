import { useCanvasStore } from "../../../store/canvasStore";
import { selectPlotCanvasHandleOverlayState } from "../../../store/canvasSelectors";
import { type SvgImport } from "../../../../../types";
import {
  DEL_HALF_PX,
  HANDLE_SCREEN_R,
  MM_TO_PX,
  PAD,
  ROTATE_CURSOR,
  RULER_W,
} from "../constants";
import type { HandlePos, Vp } from "../types";
import { SelectionOverlay } from "./SelectionOverlay";

interface RulerOverlayProps {
  vp: Vp;
  bedW: number;
  bedH: number;
  origin: "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center";
  containerW: number;
  containerH: number;
}

export function RulerOverlay({
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

  const xSepY = isBottom || isCenter ? containerH - R : R;
  const xTickDir = isBottom || isCenter ? 1 : -1;
  const xLabelY = isBottom || isCenter ? containerH - R / 2 : R / 2;

  const ySepX = isRight ? containerW - R : R;
  const yTickDir = isRight ? 1 : -1;
  const yLabelX = isRight ? containerW - R / 2 : R / 2;
  const yStripEdgeX = isRight ? containerW - R : 0;
  const yStripTopY = isBottom || isCenter ? 0 : R;
  const yStripBotY = isBottom || isCenter ? containerH - R : containerH;

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

  const TICK_COL = "var(--tf-border)";
  const LABEL_COL = "var(--tf-text-muted)";
  const ORIGIN_COL = "var(--tf-accent)";
  const BG = "var(--tf-bg-app)";
  const FONT = 9;
  const MAJOR_LEN = Math.round(R * 0.4);
  const MINOR_LEN = Math.round(R * 0.2);

  const originSx = mmToSx(0);
  const originSy = mmToSy(0);
  const originVisible =
    originSx >= R &&
    originSx <= containerW - R &&
    originSy >= yStripTopY &&
    originSy <= yStripBotY;

  const cornerX = isRight ? containerW - R : 0;
  const cornerY = isBottom || isCenter ? containerH - R : 0;

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

      {originVisible && (
        <circle
          data-testid="origin-marker"
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

interface ImportLayerProps {
  imp: SvgImport;
  selected: boolean;
  onImportMouseDown: (e: React.MouseEvent, id: string) => void;
  getBedY: (mm: number) => number;
}

export function ImportLayer({
  imp,
  selected,
  onImportMouseDown,
  getBedY,
}: ImportLayerProps) {
  const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
  const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
  const vbX = imp.viewBoxX ?? 0;
  const vbY = imp.viewBoxY ?? 0;
  const left = PAD + imp.x * MM_TO_PX;
  const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
  const bboxW = imp.svgWidth * sX;
  const bboxH = imp.svgHeight * sY;

  const cxSvg = left + bboxW / 2;
  const cySvg = top + bboxH / 2;
  const deg = imp.rotation ?? 0;

  const groupTransform = [
    `translate(${cxSvg}, ${cySvg})`,
    `rotate(${deg})`,
    `scale(${sX}, ${sY})`,
    `translate(${-(vbX + imp.svgWidth / 2)}, ${-(vbY + imp.svgHeight / 2)})`,
  ].join(" ");

  return (
    <g>
      <g
        transform={groupTransform}
        onMouseDown={(e) => onImportMouseDown(e, imp.id)}
        style={{ cursor: "grab" }}
      >
        <rect
          x={vbX}
          y={vbY}
          width={imp.svgWidth}
          height={imp.svgHeight}
          fill="transparent"
        />
      </g>
    </g>
  );
}

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

  const deleteIcon = (
    <svg
      x={-DEL_HALF_PX}
      y={-DEL_HALF_PX}
      width={DEL_HALF_PX * 2}
      height={DEL_HALF_PX * 2}
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
        fill="var(--tf-accent)"
        stroke="none"
      />
      <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
      <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
    </svg>
  );

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
          <g
            data-testid="group-handle-delete"
            transform={`translate(${delX}, ${delY})`}
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            {deleteIcon}
          </g>
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
  const [brSx, brSy] = w2s(maxWx, maxWy);
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
    ["br", brSx, brSy],
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
      <g
        data-testid="group-handle-delete"
        transform={`translate(${delSx},${delSy})`}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg
          x={-DEL_HALF_PX}
          y={-DEL_HALF_PX}
          width={DEL_HALF_PX * 2}
          height={DEL_HALF_PX * 2}
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
            fill="var(--tf-accent)"
            stroke="none"
          />
          <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
          <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
        </svg>
      </g>
    </svg>
  );
}

interface HandleOverlayProps {
  imp: SvgImport;
  zoom: number;
  panX: number;
  panY: number;
  containerW: number;
  containerH: number;
  getBedY: (mm: number) => number;
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
}

export function HandleOverlay({
  imp,
  zoom,
  panX,
  panY,
  containerW,
  containerH,
  getBedY,
  onHandleMouseDown,
  onRotateHandleMouseDown,
  onDelete,
}: HandleOverlayProps) {
  const showCentreMarker = useCanvasStore(selectPlotCanvasHandleOverlayState);
  const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
  const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
  const left = PAD + imp.x * MM_TO_PX;
  const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
  const bboxW = imp.svgWidth * sX;
  const bboxH = imp.svgHeight * sY;
  const cxSvg = left + bboxW / 2;
  const cySvg = top + bboxH / 2;
  const deg = imp.rotation ?? 0;
  const degRad = (deg * Math.PI) / 180;
  const hw = bboxW / 2;
  const hh = bboxH / 2;

  const w2s = (x: number, y: number): [number, number] => [
    x * zoom + panX,
    y * zoom + panY,
  ];

  const rotPt = (ox: number, oy: number): [number, number] => {
    const c = Math.cos(degRad);
    const ss = Math.sin(degRad);
    return [ox * c - oy * ss, ox * ss + oy * c];
  };

  const corners = (
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as [number, number][]
  ).map(([ox, oy]) => {
    const [dx, dy] = rotPt(ox, oy);
    return w2s(cxSvg + dx, cySvg + dy);
  });
  const polyPoints = corners.map(([x, y]) => `${x},${y}`).join(" ");

  type HInfo = { id: HandlePos; ox: number; oy: number };
  const handleDefs: HInfo[] = [
    { id: "tl", ox: -hw, oy: -hh },
    { id: "t", ox: 0, oy: -hh },
    { id: "tr", ox: hw, oy: -hh },
    { id: "r", ox: hw, oy: 0 },
    { id: "br", ox: hw, oy: hh },
    { id: "b", ox: 0, oy: hh },
    { id: "bl", ox: -hw, oy: hh },
    { id: "l", ox: -hw, oy: 0 },
  ];
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

  const [tcDx, tcDy] = rotPt(0, -hh);
  const [topCx, topCy] = w2s(cxSvg + tcDx, cySvg + tcDy);

  const ROTATE_STEM_PX = 24;
  const ITEM_DEL_OFFSET_PX = 12;
  const rotHx = topCx + Math.sin(degRad) * ROTATE_STEM_PX;
  const rotHy = topCy - Math.cos(degRad) * ROTATE_STEM_PX;

  const [trDx, trDy] = rotPt(hw, -hh);
  const [trSx, trSy] = w2s(cxSvg + trDx, cySvg + trDy);
  const [diagDx, diagDy] = rotPt(Math.SQRT1_2, -Math.SQRT1_2);
  const delSx = trSx + diagDx * ITEM_DEL_OFFSET_PX;
  const delSy = trSy + diagDy * ITEM_DEL_OFFSET_PX;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 4,
      }}
      width={containerW}
      height={containerH}
      viewBox={`0 0 ${containerW} ${containerH}`}
    >
      <SelectionOverlay polyPoints={polyPoints} />

      {showCentreMarker &&
        (() => {
          const [cx, cy] = w2s(cxSvg, cySvg);
          const A = 6;
          return (
            <g data-testid="handle-centre" pointerEvents="none">
              <circle
                cx={cx}
                cy={cy}
                r={A}
                fill="none"
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.85}
              />
              <line
                x1={cx - A}
                y1={cy}
                x2={cx + A}
                y2={cy}
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.85}
              />
              <line
                x1={cx}
                y1={cy - A}
                x2={cx}
                y2={cy + A}
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.85}
              />
            </g>
          );
        })()}

      {handleDefs.map(({ id, ox, oy }) => {
        const [dx, dy] = rotPt(ox, oy);
        const [hx, hy] = w2s(cxSvg + dx, cySvg + dy);
        return (
          <circle
            key={id}
            data-testid={`handle-scale-${id}`}
            cx={hx}
            cy={hy}
            r={HANDLE_SCREEN_R}
            fill="#16213e"
            stroke="var(--tf-accent)"
            strokeWidth={1.5}
            style={{ cursor: cursorMap[id], pointerEvents: "all" }}
            onMouseDown={(e) => onHandleMouseDown(e, imp.id, id)}
          />
        );
      })}

      <line
        x1={topCx}
        y1={topCy}
        x2={rotHx}
        y2={rotHy}
        stroke="var(--tf-accent)"
        strokeWidth={1}
        pointerEvents="none"
      />

      <circle
        data-testid="handle-rotate"
        cx={rotHx}
        cy={rotHy}
        r={HANDLE_SCREEN_R}
        fill="var(--tf-accent)"
        stroke="#fff"
        strokeWidth={1.5}
        style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
        onMouseDown={(e) => onRotateHandleMouseDown(e, imp.id, cxSvg, cySvg)}
      />

      <g
        data-testid="handle-delete"
        transform={`translate(${delSx},${delSy})`}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg
          x={-DEL_HALF_PX}
          y={-DEL_HALF_PX}
          width={DEL_HALF_PX * 2}
          height={DEL_HALF_PX * 2}
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
            fill="var(--tf-accent)"
            stroke="none"
          />
          <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
          <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
        </svg>
      </g>
    </svg>
  );
}
