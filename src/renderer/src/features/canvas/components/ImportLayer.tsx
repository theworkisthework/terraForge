import { type SvgImport, type SvgPath } from "../../../../../types";
import { MM_TO_PX, PAD } from "../constants";

interface ImportLayerProps {
  imp: SvgImport;
  selected: boolean;
  onImportMouseDown: (e: React.MouseEvent, id: string) => void;
  getBedY: (mm: number) => number;
}

/** Mirrors the outline-visibility rules `vectorObjectsForImport`/`drawImportsLayer`
 * already apply for regular SVG paths, so a separated bitmap's ink-channel
 * "By Colour" show/hide toggles (which set `strokeEnabled`, not `visible`)
 * actually affect the canvas preview instead of being silently ignored. */
function isInkPathVisible(imp: SvgImport, path: SvgPath): boolean {
  if (path.visible === false) return false;
  if ((imp.strokeEnabled ?? true) === false) return false;
  if ((path.strokeEnabled ?? true) === false) return false;
  const sourceOutlineVisible =
    typeof path.sourceOutlineVisible === "boolean"
      ? path.sourceOutlineVisible
      : path.outlineVisible !== false;
  const generatedStrokeEnabled =
    path.generatedStrokeEnabled ?? imp.generatedStrokeForNoStroke ?? false;
  return sourceOutlineVisible || generatedStrokeEnabled;
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
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: "grab" }}
      >
        {imp.kind === "bitmap" && imp.bitmapDataUrl && (
          <>
            {imp.bitmapSourceVisible !== false && (
              <image
                href={imp.bitmapDataUrl}
                x={vbX}
                y={vbY}
                width={imp.svgWidth}
                height={imp.svgHeight}
                opacity={imp.bitmapOpacity ?? 0.25}
                preserveAspectRatio="none"
              />
            )}
            {imp.bitmapPreviewVisible !== false && imp.paths.length > 0 && (
              // Isolated so "multiply" blends ink channels against each other
              // (and the page beneath them) like stacked transparent ink,
              // instead of each opaque stroke just occluding whatever's under
              // it in z-order — and scoped so it doesn't also blend with the
              // app's own dark canvas background outside this group.
              <g style={{ isolation: "isolate" }}>
                {imp.paths
                  .filter((path) => isInkPathVisible(imp, path))
                  .map((path) => (
                    <path
                      key={path.id}
                      d={path.d}
                      fill="none"
                      stroke={path.strokeColor ?? path.sourceColor ?? (selected ? "#60a0ff" : "#3a6aaa")}
                      strokeWidth={(imp.strokeWidthMM ?? 0.5) / Math.max(imp.scale, 0.001)}
                      opacity={imp.bitmapPreviewOpacity ?? 1}
                      style={{ mixBlendMode: "multiply" }}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ))}
              </g>
            )}
            {imp.bitmapPreviewVisible !== false && imp.paths.length === 0 && imp.bitmapRendererPath && (
              <path
                d={imp.bitmapRendererPath}
                fill="none"
                stroke={selected ? "#60a0ff" : "#3a6aaa"}
                strokeWidth={(imp.strokeWidthMM ?? 0.5) / Math.max(imp.scale, 0.001)}
                opacity={imp.bitmapPreviewOpacity ?? 1}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
          </>
        )}
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
