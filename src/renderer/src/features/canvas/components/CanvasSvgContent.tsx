import type {
  SvgImport,
  LayerGroup,
  PageSize,
  PageTemplate,
  InkStation,
} from "../../../../types";
import type { ViewportState, ContainerSize } from "../../hooks/useViewport";
import { BedLayer } from "./BedLayer";
import { GridLayer } from "./GridLayer";
import { PageTemplateOverlay } from "./PageTemplateOverlay";
import { InkServiceStationsOverlay } from "./InkServiceStationsOverlay";
import { ToolpathHitAreaOverlay } from "./ToolpathHitAreaOverlay";
import { ImportLayer } from "./ImportLayer";

interface CanvasSvgContentProps {
  bedW: number;
  bedH: number;
  getBedY: (y: number) => number;
  getBedX: (x: number) => number;
  vp: ViewportState;
  containerSize: ContainerSize;
  canvasW: number;
  canvasH: number;
  pageTemplate: PageTemplate | null;
  pageSizes: PageSize[];
  inkServiceStations: InkStation[];
  showInkServiceStationsOnCanvas: boolean;
  gcodeToolpathBounds: { x: number; y: number; w: number; h: number } | null;
  isCenter: boolean;
  isRight: boolean;
  isBottom: boolean;
  imports: SvgImport[];
  selectedImportId: string | null;
  allImportsSelected: boolean;
  selectedGroupId: string | null;
  layerGroups: LayerGroup[];
  selectImport: (id: string | null) => void;
  selectToolpath: (selected: boolean) => void;
  onImportMouseDown: (e: React.MouseEvent, imp: SvgImport) => void;
  toolpathSelected: boolean;
  justDraggedRef: React.MutableRefObject<boolean>;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

/**
 * Renders the main <svg> scene — bed, grid, page template, ink stations,
 * toolpath hit area, and SVG import layers.
 *
 * The viewBox is driven by the viewport state for smooth pan/zoom.
 */
export function CanvasSvgContent({
  bedW,
  bedH,
  getBedY,
  getBedX,
  vp,
  containerSize,
  canvasW,
  canvasH,
  pageTemplate,
  pageSizes,
  inkServiceStations,
  showInkServiceStationsOnCanvas,
  gcodeToolpathBounds,
  isCenter,
  isRight,
  isBottom,
  imports,
  selectedImportId,
  allImportsSelected,
  selectedGroupId,
  layerGroups,
  selectImport,
  selectToolpath,
  onImportMouseDown,
  toolpathSelected,
  justDraggedRef,
  svgRef,
}: CanvasSvgContentProps) {
  return (
    <svg
      ref={svgRef}
      style={{ position: "absolute", top: 0, left: 0, display: "block" }}
      width={containerSize.w || canvasW}
      height={containerSize.h || canvasH}
      viewBox={
        containerSize.w > 0
          ? `${-vp.panX / vp.zoom} ${-vp.panY / vp.zoom} ${containerSize.w / vp.zoom} ${containerSize.h / vp.zoom}`
          : `0 0 ${canvasW} ${canvasH}`
      }
      className="cursor-default"
      onClick={() => {
        if (justDraggedRef.current) {
          justDraggedRef.current = false;
          return;
        }
        selectImport(null);
        selectToolpath(false);
      }}
    >
      <BedLayer bedW={bedW} bedH={bedH} />

      <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedY} />

      <PageTemplateOverlay
        pageTemplate={pageTemplate}
        pageSizes={pageSizes}
        vp={vp}
        getBedX={getBedX}
        getBedY={getBedY}
      />

      <InkServiceStationsOverlay
        stations={inkServiceStations}
        visible={showInkServiceStationsOnCanvas}
        getBedX={getBedX}
        getBedY={getBedY}
      />

      <ToolpathHitAreaOverlay
        bounds={gcodeToolpathBounds}
        isCenter={isCenter}
        isRight={isRight}
        isBottom={isBottom}
        bedW={bedW}
        bedH={bedH}
        selectImport={selectImport}
        selectToolpath={selectToolpath}
        toolpathSelected={toolpathSelected}
      />

      {imports
        .filter((imp) => imp.visible)
        .map((imp) => (
          <ImportLayer
            key={imp.id}
            imp={imp}
            selected={
              allImportsSelected ||
              selectedImportId === imp.id ||
              (!!selectedGroupId &&
                !!layerGroups
                  .find((g) => g.id === selectedGroupId)
                  ?.importIds.includes(imp.id))
            }
            onImportMouseDown={onImportMouseDown}
            getBedY={getBedY}
          />
        ))}
    </svg>
  );
}
