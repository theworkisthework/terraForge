import { MM_TO_PX } from "../constants";

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
