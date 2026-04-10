import { useCanvasStore } from "../../../store/canvasStore";
import { selectPlotCanvasHandleOverlayState } from "../../../store/canvasSelectors";
import { type SvgImport } from "../../../../../types";
import { HANDLE_SCREEN_R, MM_TO_PX, PAD, ROTATE_CURSOR } from "../constants";
import type { HandlePos } from "../types";
import { DeleteActionBadge } from "./DeleteActionBadge";
import { SelectionOverlay } from "./SelectionOverlay";

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

      <DeleteActionBadge
        dataTestId="handle-delete"
        x={delSx}
        y={delSy}
        onDelete={onDelete}
      />
    </svg>
  );
}
