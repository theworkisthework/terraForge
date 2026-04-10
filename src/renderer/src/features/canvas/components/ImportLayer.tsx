import { type SvgImport } from "../../../../../types";
import { MM_TO_PX, PAD } from "../constants";

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
