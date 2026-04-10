import { MM_TO_PX, PAD } from "../constants";

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
