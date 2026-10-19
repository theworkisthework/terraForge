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

/**
 * The page's rectangle in canvas pixels (before the viewport transform), or
 * null when no page is shown. Shared by this outline and the paper fill the
 * canvas draws beneath imports, so the two always line up.
 */
export function pageRectPx(
  pageTemplate: PageTemplateOption | null,
  pageSizes: PageSizeOption[],
  getBedX: (mmX: number) => number,
  getBedY: (mmY: number) => number,
): { x: number; y: number; w: number; h: number } | null {
  if (!pageTemplate) return null;
  const activeSize = pageSizes.find((ps) => ps.id === pageTemplate.sizeId);
  if (!activeSize) return null;
  const pgW = pageTemplate.landscape ? activeSize.heightMM : activeSize.widthMM;
  const pgH = pageTemplate.landscape ? activeSize.widthMM : activeSize.heightMM;
  const x0 = getBedX(0);
  const x1 = getBedX(pgW);
  const y0 = getBedY(pgH);
  const y1 = getBedY(0);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function PageTemplateOverlay({
  pageTemplate,
  pageSizes,
  vp,
  getBedX,
  getBedY,
}: PageTemplateOverlayProps) {
  const rect = pageRectPx(pageTemplate, pageSizes, getBedX, getBedY);
  if (!pageTemplate || !rect) return null;
  const activeSize = pageSizes.find((ps) => ps.id === pageTemplate.sizeId)!;
  const { x: rectX, y: rectY, w: rectW, h: rectH } = rect;
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
