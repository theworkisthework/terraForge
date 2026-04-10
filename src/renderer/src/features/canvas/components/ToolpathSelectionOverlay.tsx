import { MM_TO_PX, PAD } from "../constants";
import { DeleteActionBadge } from "./DeleteActionBadge";

interface ToolpathBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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
        <DeleteActionBadge
          dataTestId="toolpath-delete"
          x={delSx}
          y={delSy}
          onDelete={onDelete}
        />
      )}
    </svg>
  );
}
