import { type SvgImport } from "../../../../../types";
import { HANDLE_SCREEN_R, ROTATE_CURSOR } from "../constants";
import type { HandlePos } from "../types";
import { rotatedExtents } from "../utils/handleGeometry";
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
  onGroupHandleMouseDown: (e: React.MouseEvent<SVGCircleElement>, handle: HandlePos) => void;
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

const CURSORS: Record<HandlePos, string> = {
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

/** The group frame in screen pixels: its edges (x0 left … y1 bottom), centre
 * lines, and size — each computed the way its branch always has. */
interface Frame {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** The frame, handles and badge, the same whether or not the box is rotated. */
function FrameHandles({
  frame,
  onGroupMouseDown,
  onGroupHandleMouseDown,
  onRotateMouseDown,
  onDelete,
}: {
  frame: Frame;
  onGroupMouseDown: GroupHandleOverlayProps["onGroupMouseDown"];
  onGroupHandleMouseDown: GroupHandleOverlayProps["onGroupHandleMouseDown"];
  onRotateMouseDown: (e: React.MouseEvent<SVGCircleElement>) => void;
  onDelete: () => void;
}) {
  const { x0, x1, y0, y1, cx, cy, w, h } = frame;
  const rotHy = y0 - ROTATE_STEM_PX;
  const handles: [HandlePos, number, number][] = [
    ["tl", x0, y0],
    ["t", cx, y0],
    ["tr", x1, y0],
    ["r", x1, cy],
    ["br", x1, y1],
    ["b", cx, y1],
    ["bl", x0, y1],
    ["l", x0, cy],
  ];
  return (
    <>
      <rect
        x={x0}
        y={y0}
        width={w}
        height={h}
        fill="none"
        stroke="var(--tf-accent)"
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />
      <rect
        x={x0}
        y={y0}
        width={w}
        height={h}
        fill="transparent"
        style={{ cursor: "grab", pointerEvents: "all" }}
        onMouseDown={onGroupMouseDown}
      />
      <line x1={cx} y1={y0} x2={cx} y2={rotHy} stroke="var(--tf-accent)" strokeWidth={1} pointerEvents="none" />
      <circle
        cx={cx}
        cy={rotHy}
        r={HANDLE_SCREEN_R}
        fill="var(--tf-accent)"
        stroke="white"
        strokeWidth={1.5}
        style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
        onMouseDown={onRotateMouseDown}
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
          style={{ cursor: CURSORS[id], pointerEvents: "all" }}
          onMouseDown={(e) => onGroupHandleMouseDown(e, id)}
        />
      ))}
      <DeleteActionBadge
        dataTestId="group-handle-delete"
        x={x1 + GROUP_DEL_OFFSET_PX * 0.7}
        y={y0 - GROUP_DEL_OFFSET_PX * 0.7}
        onDelete={onDelete}
      />
    </>
  );
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
  const sx = (x: number) => x * zoom + panX;
  const sy = (y: number) => y * zoom + panY;

  // A box persisted from a rotation keeps its own geometry and angle;
  // otherwise it is the padded axis-aligned box around the imports.
  let frame: Frame;
  let box: { gCx: number; gCy: number; gHW: number; gHH: number };
  if (activeOBB) {
    box = activeOBB;
    const [pivotSx, pivotSy] = [sx(box.gCx), sy(box.gCy)];
    const hw = box.gHW * zoom;
    const hh = box.gHH * zoom;
    frame = {
      x0: pivotSx - hw,
      x1: pivotSx + hw,
      y0: pivotSy - hh,
      y1: pivotSy + hh,
      cx: pivotSx,
      cy: pivotSy,
      w: hw * 2,
      h: hh * 2,
    };
  } else {
    let { minWx, maxWx, minWy, maxWy } = rotatedExtents(imports, getBedY);
    const BBOX_PAD_W = 6 / zoom;
    minWx -= BBOX_PAD_W;
    maxWx += BBOX_PAD_W;
    minWy -= BBOX_PAD_W;
    maxWy += BBOX_PAD_W;
    box = { gCx: (minWx + maxWx) / 2, gCy: (minWy + maxWy) / 2, gHW: (maxWx - minWx) / 2, gHH: (maxWy - minWy) / 2 };
    frame = {
      x0: sx(minWx),
      x1: sx(maxWx),
      y0: sy(minWy),
      y1: sy(maxWy),
      cx: sx(box.gCx),
      cy: sy(box.gCy),
      w: sx(maxWx) - sx(minWx),
      h: sy(maxWy) - sy(minWy),
    };
  }

  const handles = (
    <FrameHandles
      frame={frame}
      onGroupMouseDown={onGroupMouseDown}
      onGroupHandleMouseDown={onGroupHandleMouseDown}
      onRotateMouseDown={(e) => onGroupRotateHandleMouseDown(e, box.gCx, box.gCy, box.gHW, box.gHH)}
      onDelete={onDelete}
    />
  );
  return (
    <svg
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 5 }}
      width={containerW}
      height={containerH}
      viewBox={`0 0 ${containerW} ${containerH}`}
    >
      {activeOBB ? <g transform={`rotate(${activeOBB.angle}, ${frame.cx}, ${frame.cy})`}>{handles}</g> : handles}
    </svg>
  );
}
