import { useRef } from "react";
import { Crosshair } from "lucide-react";
import { MM_TO_PX, PAD } from "../constants";

interface PageSizeOption {
  id: string;
  name: string;
  widthMM: number;
  heightMM: number;
}

interface PageTemplateOption {
  sizeId: string;
  landscape: boolean;
  marginMM?: number;
}

interface ViewportLike {
  zoom: number;
}

interface PageTemplateOverlayProps {
  pageTemplate: PageTemplateOption | null;
  pageSizes: PageSizeOption[];
  vp: ViewportLike;
  getBedX: (mmX: number) => number;
  getBedY: (mmY: number) => number;
}

export function PageTemplateOverlay({
  pageTemplate,
  pageSizes,
  vp,
  getBedX,
  getBedY,
}: PageTemplateOverlayProps) {
  if (!pageTemplate) return null;
  const activeSize = pageSizes.find((ps) => ps.id === pageTemplate.sizeId);
  if (!activeSize) return null;

  const pgW = pageTemplate.landscape ? activeSize.heightMM : activeSize.widthMM;
  const pgH = pageTemplate.landscape ? activeSize.widthMM : activeSize.heightMM;

  const svgX0 = getBedX(0);
  const svgX1 = getBedX(pgW);
  const svgY0 = getBedY(pgH);
  const svgY1 = getBedY(0);
  const rectX = Math.min(svgX0, svgX1);
  const rectY = Math.min(svgY0, svgY1);
  const rectW = Math.abs(svgX1 - svgX0);
  const rectH = Math.abs(svgY1 - svgY0);
  const label = `${activeSize.name} ${pageTemplate.landscape ? "Landscape" : "Portrait"}`;
  const labelSize = 11 / vp.zoom;

  const marginPx = (pageTemplate.marginMM ?? 20) * MM_TO_PX;
  const mX = rectX + marginPx;
  const mY = rectY + marginPx;
  const mW = rectW - marginPx * 2;
  const mH = rectH - marginPx * 2;

  return (
    <g pointerEvents="none">
      <rect
        x={rectX}
        y={rectY}
        width={rectW}
        height={rectH}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={1}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
        opacity={0.65}
      />
      {mW > 0 && mH > 0 && (
        <rect
          x={mX}
          y={mY}
          width={mW}
          height={mH}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          opacity={0.35}
        />
      )}
      <text
        x={rectX + 4 / vp.zoom}
        y={rectY - 4 / vp.zoom}
        fontSize={labelSize}
        fill="#f59e0b"
        opacity={0.65}
        vectorEffect="non-scaling-stroke"
        fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  );
}

interface ToolpathBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface ToolpathHitAreaOverlayProps {
  bounds: ToolpathBounds | null;
  isCenter: boolean;
  isRight: boolean;
  isBottom: boolean;
  bedW: number;
  bedH: number;
  selectImport: (id: string | null) => void;
  selectToolpath: (selected: boolean) => void;
  toolpathSelected: boolean;
}

export function ToolpathHitAreaOverlay({
  bounds,
  isCenter,
  isRight,
  isBottom,
  bedW,
  bedH,
  selectImport,
  selectToolpath,
  toolpathSelected,
}: ToolpathHitAreaOverlayProps) {
  if (!bounds) return null;
  const { minX, maxX, minY, maxY } = bounds;

  return (
    <>
      <g
        transform={`translate(${isCenter ? PAD + (bedW / 2) * MM_TO_PX : isRight ? PAD + bedW * MM_TO_PX : PAD}, ${isCenter ? PAD + (bedH / 2) * MM_TO_PX : isBottom ? PAD + bedH * MM_TO_PX : PAD}) scale(${isRight ? -MM_TO_PX : MM_TO_PX}, ${isCenter || isBottom ? -MM_TO_PX : MM_TO_PX})`}
      >
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
            selectToolpath(true);
          }}
        />
      </g>
      {toolpathSelected && <g pointerEvents="none" />}
    </>
  );
}

interface ToolpathSelectionOverlayProps {
  bounds: ToolpathBounds | null;
  toolpathSelected: boolean;
  containerW: number;
  containerH: number;
  vp: { zoom: number; panX: number; panY: number };
  isCenter: boolean;
  isRight: boolean;
  isBottom: boolean;
  bedW: number;
  bedH: number;
  isJobActive: boolean;
  onDelete: () => void;
}

export function ToolpathSelectionOverlay({
  bounds,
  toolpathSelected,
  containerW,
  containerH,
  vp,
  isCenter,
  isRight,
  isBottom,
  bedW,
  bedH,
  isJobActive,
  onDelete,
}: ToolpathSelectionOverlayProps) {
  if (!bounds || !toolpathSelected || containerW <= 0) return null;

  const { minX, maxX, minY, maxY } = bounds;
  const svgL = isCenter
    ? PAD + (bedW / 2 + minX) * MM_TO_PX
    : isRight
      ? PAD + (bedW - maxX) * MM_TO_PX
      : PAD + minX * MM_TO_PX;
  const svgR = isCenter
    ? PAD + (bedW / 2 + maxX) * MM_TO_PX
    : isRight
      ? PAD + (bedW - minX) * MM_TO_PX
      : PAD + maxX * MM_TO_PX;
  const svgT = isCenter
    ? PAD + (bedH / 2 - maxY) * MM_TO_PX
    : isBottom
      ? PAD + (bedH - maxY) * MM_TO_PX
      : PAD + minY * MM_TO_PX;
  const svgB = isCenter
    ? PAD + (bedH / 2 - minY) * MM_TO_PX
    : isBottom
      ? PAD + (bedH - minY) * MM_TO_PX
      : PAD + maxY * MM_TO_PX;

  const sl = svgL * vp.zoom + vp.panX;
  const sr = svgR * vp.zoom + vp.panX;
  const st = svgT * vp.zoom + vp.panY;
  const sb = svgB * vp.zoom + vp.panY;
  const delSx = sr + 14;
  const delSy = st - 14;
  const TP_HALF = 8;
  const TP_PIP = 2.5;

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
      <rect
        x={sl}
        y={st}
        width={sr - sl}
        height={sb - st}
        fill="none"
        stroke="#38bdf8"
        strokeWidth={1}
        strokeDasharray="5 3"
        pointerEvents="none"
      />
      {(
        [
          [sl, st],
          [sr, st],
          [sl, sb],
          [sr, sb],
        ] as [number, number][]
      ).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={TP_PIP} fill="#38bdf8" />
      ))}
      {!isJobActive && (
        <g
          transform={`translate(${delSx},${delSy})`}
          style={{ cursor: "pointer", pointerEvents: "all" }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <svg
            x={-TP_HALF}
            y={-TP_HALF}
            width={TP_HALF * 2}
            height={TP_HALF * 2}
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
      )}
    </svg>
  );
}

interface MachineStatusLike {
  raw?: string;
  wpos?: { x: number; y: number; z: number };
  mpos: { x: number; y: number; z: number };
}

interface PenCrosshairOverlayProps {
  connected: boolean;
  machineStatus: MachineStatusLike | null;
  containerW: number;
  vp: { zoom: number; panX: number; panY: number };
  isCenter: boolean;
  isRight: boolean;
  isBottom: boolean;
  bedW: number;
  bedH: number;
}

export function PenCrosshairOverlay({
  connected,
  machineStatus,
  containerW,
  vp,
  isCenter,
  isRight,
  isBottom,
  bedW,
  bedH,
}: PenCrosshairOverlayProps) {
  const penWcoRef = useRef({ x: 0, y: 0, z: 0 });

  if (!connected || !machineStatus || containerW <= 0) return null;

  const wcoMatch = machineStatus.raw?.match(
    /WCO:([-\d.]+),([-\d.]+),([-\d.]+)/,
  );
  if (wcoMatch) {
    penWcoRef.current = {
      x: +wcoMatch[1],
      y: +wcoMatch[2],
      z: +wcoMatch[3],
    };
  }

  const hasWPos =
    /WPos:/.test(machineStatus.raw ?? "") && machineStatus.wpos != null;
  const penX = hasWPos
    ? machineStatus.wpos!.x
    : machineStatus.mpos.x - penWcoRef.current.x;
  const penY = hasWPos
    ? machineStatus.wpos!.y
    : machineStatus.mpos.y - penWcoRef.current.y;

  const svgX = isCenter
    ? PAD + (bedW / 2 + penX) * MM_TO_PX
    : isRight
      ? PAD + (bedW - penX) * MM_TO_PX
      : PAD + penX * MM_TO_PX;
  const svgY = isCenter
    ? PAD + (bedH / 2 - penY) * MM_TO_PX
    : isBottom
      ? PAD + (bedH - penY) * MM_TO_PX
      : PAD + penY * MM_TO_PX;

  const sx = vp.panX + svgX * vp.zoom;
  const sy = vp.panY + svgY * vp.zoom;

  return (
    <div
      style={{
        position: "absolute",
        left: sx,
        top: sy,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 5,
        color: "#22c55e",
        opacity: 0.9,
        filter: "drop-shadow(0 0 3px #15803d)",
      }}
    >
      <Crosshair size={24} strokeWidth={1.5} />
    </div>
  );
}
