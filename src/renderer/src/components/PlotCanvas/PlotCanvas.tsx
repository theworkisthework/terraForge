// Portions of SVG icon data (square-x, rotate-cw, crosshair) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
// REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT,
// OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE,
// DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
// ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
import { useEffect, useRef } from "react";
import { usePlotProgress } from "../../utils/usePlotProgress";
import { useMachineStore } from "../../store/machineStore";
import {
  RULER_W,
  RulerOverlay,
  ToolpathSelectionOverlay,
  PenCrosshairOverlay,
  ToolpathOverlay,
  CanvasSvgContent,
  CanvasHandleOverlays,
  useViewport,
  useCanvasPanZoom,
} from "../../features/canvas";
import { usePlotCanvasState, usePlotCanvasGeometry, usePlotCanvasInteraction } from "./hooks";
import { PlotCanvasControls } from "./components";

export function PlotCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const prevConfigIdRef = useRef<string | null>(activeConfigId);

  const state = usePlotCanvasState();
  const { canvas, toolpath, theme, selectedJobFile, setSelectedJobFile, machineStatus, connected, isJobActive } = state;
  const { showInkServiceStationsOnCanvas, respectSvgColorsOnCanvas, inkServiceStations } = state;
  const { imports, selectedImportId, allImportsSelected, selectedGroupId, layerGroups, pageTemplate, pageSizes } = canvas;
  const { selectGroup, selectImport, removeImport, clearImports } = canvas;
  const { gcodeToolpath, setGcodeToolpath, toolpathSelected, selectToolpath } = toolpath;
  const { toolpathVisible, toolpathColorized, toolpathOpacity, plotProgressCuts, plotProgressRapids } = toolpath;

  // Activate live plot-progress tracking whenever a toolpath is loaded
  // and the machine is running a job.
  usePlotProgress();

  const geometry = usePlotCanvasGeometry(state.activeConfig());
  const { bedW, bedH, origin, isBottom, isRight, isCenter, getBedY, getBedX } = geometry;
  const { bedXMin, bedXMax, bedYMin, bedYMax, canvasW, canvasH, fitInsets } = geometry;

  // ── Viewport (vp state, fit calculation, ResizeObserver) ────────────────────
  const { vp, vpRef, setVp, fitted, setFitted, fitToView, containerSize } =
    useViewport(containerRef, canvasW, canvasH, fitInsets);

  // ── Pan/Zoom (wheel event listener) ─────────────────────────────────────────
  const { zoomBy } = useCanvasPanZoom(containerRef, vpRef, setVp, setFitted);

  // ── Panning, dragging, scaling, rotating and keyboard shortcuts ─────────────
  const interaction = usePlotCanvasInteraction({ containerRef, vpRef, setVp, setFitted, zoomBy, fitToView, state, geometry });
  const { spaceDown, justDraggedRef, onImportMouseDown, onContainerMouseDown, onContextMenu, cursor } = interaction;

  // Switching machine configs can change bed geometry; refit immediately so
  // the new bed size/origin is visible without requiring a manual fit action.
  useEffect(() => {
    if (prevConfigIdRef.current !== activeConfigId) {
      prevConfigIdRef.current = activeConfigId;
      fitToView();
    }
  }, [activeConfigId, fitToView]);

  // ── Toolpath canvas overlay — see ToolpathOverlay component below ────────────

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-app relative select-none"
      style={{ cursor }}
      onMouseDown={onContainerMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* Toolpath canvas — renders G-code paths with per-frame LOD.
          Positioned below the main SVG so SVG imports appear on top. */}
      <ToolpathOverlay
        vp={vp}
        containerSize={containerSize}
        isCenter={isCenter}
        isBottom={isBottom}
        isRight={isRight}
        bedW={bedW}
        bedH={bedH}
        bedXMin={bedXMin}
        bedXMax={bedXMax}
        bedYMin={bedYMin}
        bedYMax={bedYMax}
        canvasH={canvasH}
        imports={imports}
        selectedImportId={selectedImportId}
        allImportsSelected={allImportsSelected}
        selectedGroupId={selectedGroupId}
        layerGroups={layerGroups}
        gcodeToolpath={gcodeToolpath}
        toolpathSelected={toolpathSelected}
        toolpathVisible={toolpathVisible}
        toolpathColorized={toolpathColorized}
        toolpathOpacity={toolpathOpacity}
        plotProgressCuts={plotProgressCuts ?? null}
        plotProgressRapids={plotProgressRapids ?? null}
        respectSvgColorsOnCanvas={respectSvgColorsOnCanvas}
        theme={theme}
        pageTemplate={pageTemplate}
        pageSizes={pageSizes}
      />

      {/* SVG scene — bed, grid, imports */}

      <CanvasSvgContent
        bedW={bedW}
        bedH={bedH}
        getBedY={getBedY}
        getBedX={getBedX}
        vp={vp}
        containerSize={containerSize}
        canvasW={canvasW}
        canvasH={canvasH}
        pageTemplate={pageTemplate}
        pageSizes={pageSizes}
        inkServiceStations={inkServiceStations}
        showInkServiceStationsOnCanvas={showInkServiceStationsOnCanvas}
        gcodeToolpathBounds={gcodeToolpath?.bounds ?? null}
        isCenter={isCenter}
        isRight={isRight}
        isBottom={isBottom}
        imports={imports}
        selectedImportId={selectedImportId}
        allImportsSelected={allImportsSelected}
        selectedGroupId={selectedGroupId}
        layerGroups={layerGroups}
        selectImport={selectImport}
        selectToolpath={selectToolpath}
        onImportMouseDown={onImportMouseDown}
        toolpathSelected={toolpathSelected}
        justDraggedRef={justDraggedRef}
        svgRef={svgRef}
      />

      {/* Handle overlay — bounding box + handles in screen-pixel space */}

      <CanvasHandleOverlays
        imports={imports}
        selectedImportId={selectedImportId}
        allImportsSelected={allImportsSelected}
        selectedGroupId={selectedGroupId}
        layerGroups={layerGroups}
        zoom={vp.zoom}
        panX={vp.panX}
        panY={vp.panY}
        containerW={containerSize.w}
        containerH={containerSize.h}
        getBedY={getBedY}
        groupObbAngle={interaction.groupOBBAngle}
        groupRotating={interaction.groupRotating}
        persistentGroupOBB={interaction.persistentGroupOBB}
        onGroupMouseDown={interaction.onGroupMouseDown}
        onHandleMouseDown={interaction.onHandleMouseDown}
        onRotateHandleMouseDown={interaction.onRotateHandleMouseDown}
        onGroupHandleMouseDown={interaction.onGroupHandleMouseDown}
        onGroupRotateHandleMouseDown={interaction.onGroupRotateHandleMouseDown}
        clearImports={clearImports}
        removeImport={removeImport}
        selectGroup={selectGroup}
      />

      <ToolpathSelectionOverlay
        bounds={gcodeToolpath?.bounds ?? null}
        toolpathSelected={toolpathSelected}
        containerW={containerSize.w}
        containerH={containerSize.h}
        vp={vp}
        isCenter={isCenter}
        isRight={isRight}
        isBottom={isBottom}
        bedW={bedW}
        bedH={bedH}
        isJobActive={isJobActive}
        onDelete={() => {
          setGcodeToolpath(null);
          if (selectedJobFile?.source === "local") setSelectedJobFile(null);
        }}
      />

      <PenCrosshairOverlay
        connected={connected}
        machineStatus={machineStatus}
        containerW={containerSize.w}
        vp={vp}
        isCenter={isCenter}
        isRight={isRight}
        isBottom={isBottom}
        bedW={bedW}
        bedH={bedH}
      />

      <PlotCanvasControls
        fitted={fitted}
        zoom={vp.zoom}
        spaceDown={spaceDown}
        rightInsetPx={16 + (isRight ? RULER_W : 0)}
        onZoomIn={interaction.onZoomIn}
        onZoomOut={interaction.onZoomOut}
        onFit={interaction.onFit}
      />

      {/* Ruler overlay — screen-space, always crisp */}
      {containerSize.w > 0 && (
        <RulerOverlay
          vp={vp}
          bedW={bedW}
          bedH={bedH}
          origin={origin}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      )}
    </div>
  );
}
