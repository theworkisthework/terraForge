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
import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../store/canvasStore";
import { useThemeStore } from "../store/themeStore";
import {
  selectPlotCanvasCanvasState,
  selectPlotCanvasToolpathState,
} from "../store/canvasSelectors";
import { useMachineStore } from "../store/machineStore";
import { usePlotProgress } from "../utils/usePlotProgress";
import { DEFAULT_STROKE_WIDTH_MM } from "../../../types";
import {
  MM_TO_PX,
  PAD,
  ZOOM_STEP,
  ROTATE_CURSOR,
  BedLayer,
  GridLayer,
  RulerOverlay,
  ImportLayer,
  GroupHandleOverlay,
  HandleOverlay,
  PageTemplateOverlay,
  ToolpathHitAreaOverlay,
  ToolpathSelectionOverlay,
  PenCrosshairOverlay,
  ToolpathOverlay,
  useViewport,
  useCanvasPanZoom,
} from "../features/canvas";
import {
  useSpaceKeyPan,
  useObjectDrag,
  useObjectScaleRotate,
  useGroupOBB,
  useCanvasKeyboardShortcuts,
  useToolpathSelectionSync,
  useCanvasGestureLifecycle,
  useCanvasInteractionHandlers,
} from "../features/canvas";

export function PlotCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    imports,
    selectedImportId,
    allImportsSelected,
    selectedGroupId,
    selectGroup,
    selectImport,
    removeImport,
    clearImports,
    updateImport,
    layerGroups,
    pageTemplate,
    pageSizes,
  } = useCanvasStore(useShallow(selectPlotCanvasCanvasState));
  const {
    gcodeToolpath,
    setGcodeToolpath,
    gcodeSource,
    toolpathSelected,
    selectToolpath,
    plotProgressCuts,
    plotProgressRapids,
  } = useCanvasStore(useShallow(selectPlotCanvasToolpathState));
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const theme = useThemeStore((s) => s.theme);
  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const machineStatus = useMachineStore((s) => s.status);
  const connected = useMachineStore((s) => s.connected);
  const isJobActive =
    machineStatus?.state === "Run" || machineStatus?.state === "Hold";

  // Activate live plot-progress tracking whenever a toolpath is loaded
  // and the machine is running a job.
  usePlotProgress();

  const config = activeConfig();
  const bedW = config?.bedWidth ?? 220;
  const bedH = config?.bedHeight ?? 200;
  const origin = config?.origin ?? "bottom-left";
  const isBottom = origin === "bottom-left" || origin === "bottom-right";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isCenter = origin === "center";
  // Bed coordinate bounds in machine mm (center origin uses ±half-dim)
  const bedXMin = isCenter ? -bedW / 2 : 0;
  const bedXMax = isCenter ? bedW / 2 : bedW;
  const bedYMin = isCenter ? -bedH / 2 : 0;
  const bedYMax = isCenter ? bedH / 2 : bedH;

  const canvasW = bedW * MM_TO_PX + PAD * 2;
  const canvasH = bedH * MM_TO_PX + PAD * 2;

  // ── Viewport (vp state, fit calculation, ResizeObserver) ────────────────────
  const {
    vp,
    vpRef,
    setVp,
    fitted,
    setFitted,
    computeFit,
    fitToView,
    containerSize,
  } = useViewport(containerRef, canvasW, canvasH);

  // ── Pan/Zoom (wheel event listener) ─────────────────────────────────────────
  const { zoomBy } = useCanvasPanZoom(containerRef, vpRef, setVp, setFitted);

  // ── Pan state ─────────────────────────────────────────────────────────────────
  // ── useSpaceKeyPan ─── space-key pan mode + pan gesture state machine ────────
  const {
    spaceDown,
    spaceRef,
    setSpacePressed,
    isPanning,
    panStartRef,
    startPan,
    updatePanMove,
    endPan,
  } = useSpaceKeyPan(vpRef, setVp, setFitted);

  // ── useObjectDrag ─── single / group object drag state machine ───────────────
  const {
    dragging,
    justDraggedRef,
    onImportMouseDown,
    onGroupMouseDown,
    updateDragMove,
    endDrag,
  } = useObjectDrag(vpRef, spaceRef, selectImport, updateImport);

  // ── useObjectScaleRotate ─── scale / rotate handle state machines ────────────
  const {
    scaling,
    rotating,
    onHandleMouseDown,
    onRotateHandleMouseDown,
    updateScaleMove,
    updateRotateMove,
    endScale,
    endRotate,
  } = useObjectScaleRotate(containerRef, vpRef, updateImport);

  // ── useGroupOBB ─── group scale / rotate + persistent OBB ───────────────────
  const {
    groupScaling,
    groupRotating,
    groupOBBAngle,
    persistentGroupOBB,
    onGroupHandleMouseDown,
    onGroupRotateHandleMouseDown,
    updateGroupScaleMove,
    updateGroupRotateMove,
    endGroupScaling,
    endGroupRotating,
    clearGroupOBB,
  } = useGroupOBB(
    containerRef,
    vpRef,
    updateImport,
    isBottom,
    canvasH,
    allImportsSelected,
    selectedGroupId,
  );

  // ── Toolpath selection ────────────────────────────────────────────────────────
  // toolpathSelected and selectToolpath live in canvasStore so PropertiesPanel
  // can react to canvas selection changes (and vice versa).

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useCanvasKeyboardShortcuts({
    selectedImportId,
    allImportsSelected,
    selectedGroupId,
    toolpathSelected,
    isJobActive,
    selectGroup,
    selectImport,
    removeImport,
    clearImports,
    selectToolpath,
    setGcodeToolpath,
    zoomBy,
    fitToView,
    setSpacePressed,
  });

  useToolpathSelectionSync({
    gcodeToolpath,
    gcodeSource,
    toolpathSelected,
    setSelectedJobFile,
  });

  // ── SVG coordinate helpers (map machine-mm → canvas SVG px) ─────────────────
  // Y: bottom-origins flip so mm=0 is at the bottom of the bed rectangle.
  const getBedY = (mmY: number) =>
    isBottom ? canvasH - PAD - mmY * MM_TO_PX : PAD + mmY * MM_TO_PX;
  // X: right-origins flip so mm=0 is at the right of the bed rectangle.
  const getBedX = (mmX: number) =>
    isRight ? PAD + (bedW - mmX) * MM_TO_PX : PAD + mmX * MM_TO_PX;

  useCanvasGestureLifecycle({
    dragging,
    scaling,
    rotating,
    groupScaling,
    groupRotating,
    groupOBBAngle,
    panStartRef,
    justDraggedRef,
    updatePanMove,
    updateDragMove,
    updateScaleMove,
    updateRotateMove,
    updateGroupScaleMove,
    updateGroupRotateMove,
    endDrag,
    endScale,
    endRotate,
    endGroupRotating,
    clearGroupOBB,
    endGroupScaling,
    endPan,
  });

  const {
    onContainerMouseDown,
    onContextMenu,
    onZoomIn,
    onZoomOut,
    onFit,
    cursor,
  } = useCanvasInteractionHandlers({
    startPan,
    spaceRef,
    zoomBy,
    fitToView,
    spaceDown,
    isPanning,
    rotating,
  });

  // ── Toolpath canvas overlay — see ToolpathOverlay component below ────────────

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-app relative select-none"
      style={{ cursor }}
      onMouseDown={onContainerMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* ── Toolpath canvas — renders G-code paths with per-frame LOD.
           Positioned below the main SVG so SVG imports appear on top.
           pointerEvents:none keeps all click/drag handling on the SVG layer. ── */}
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
        plotProgressCuts={plotProgressCuts ?? null}
        plotProgressRapids={plotProgressRapids ?? null}
        theme={theme}
      />

      {/* ── Canvas SVG — fills the container; viewBox drives pan/zoom so the
           browser renders all paths at native screen resolution instead of
           rasterising a CSS-scaled compositing layer (which causes blurriness). ── */}
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
          // Suppress deselect if a drag/scale/rotate/pan gesture just ended;
          // the browser synthesises a click on mouseup even after a drag.
          if (justDraggedRef.current) {
            justDraggedRef.current = false;
            return;
          }
          selectImport(null);
          selectToolpath(false);
        }}
      >
        {/* Bed background — filled by the canvas layer behind this SVG.
             fill="none" here so the canvas #0d1117 rect shows through. */}
        <BedLayer bedW={bedW} bedH={bedH} />

        {/* Grid — 10 mm intervals, major every 50 mm */}
        <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedY} />

        {/* Rulers are rendered as a screen-space overlay — see below */}

        <PageTemplateOverlay
          pageTemplate={pageTemplate}
          pageSizes={pageSizes}
          vp={vp}
          getBedX={getBedX}
          getBedY={getBedY}
        />

        <ToolpathHitAreaOverlay
          bounds={gcodeToolpath?.bounds ?? null}
          isCenter={isCenter}
          isRight={isRight}
          isBottom={isBottom}
          bedW={bedW}
          bedH={bedH}
          selectImport={selectImport}
          selectToolpath={selectToolpath}
          toolpathSelected={toolpathSelected}
        />

        {/* SVG imports — paths only; handles rendered in HandleOverlay */}
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

      {/* ── Handle overlay — bounding box + handles in pure screen-pixel space */}
      {(allImportsSelected || !!selectedGroupId) && containerSize.w > 0 ? (
        <GroupHandleOverlay
          imports={(allImportsSelected
            ? imports
            : imports.filter(
                (i) =>
                  !!layerGroups
                    .find((g) => g.id === selectedGroupId)
                    ?.importIds.includes(i.id),
              )
          ).filter((i) => i.visible)}
          zoom={vp.zoom}
          panX={vp.panX}
          panY={vp.panY}
          containerW={containerSize.w}
          containerH={containerSize.h}
          getBedY={getBedY}
          onGroupMouseDown={onGroupMouseDown}
          onGroupHandleMouseDown={onGroupHandleMouseDown}
          onGroupRotateHandleMouseDown={onGroupRotateHandleMouseDown}
          onDelete={
            allImportsSelected
              ? clearImports
              : () => {
                  const st = useCanvasStore.getState();
                  const gids = new Set(
                    st.layerGroups.find((g) => g.id === selectedGroupId)
                      ?.importIds ?? [],
                  );
                  st.imports
                    .filter((i) => gids.has(i.id))
                    .forEach((i) => st.removeImport(i.id));
                  selectGroup(null);
                }
          }
          activeOBB={
            groupRotating
              ? {
                  gCx: groupRotating.gCx,
                  gCy: groupRotating.gCy,
                  gHW: groupRotating.gHW,
                  gHH: groupRotating.gHH,
                  angle: groupOBBAngle,
                }
              : (persistentGroupOBB ?? undefined)
          }
        />
      ) : (
        selectedImportId &&
        containerSize.w > 0 &&
        (() => {
          const imp = imports.find((i) => i.id === selectedImportId);
          return imp ? (
            <HandleOverlay
              imp={imp}
              zoom={vp.zoom}
              panX={vp.panX}
              panY={vp.panY}
              containerW={containerSize.w}
              containerH={containerSize.h}
              getBedY={getBedY}
              onHandleMouseDown={onHandleMouseDown}
              onRotateHandleMouseDown={onRotateHandleMouseDown}
              onDelete={() => removeImport(imp.id)}
            />
          ) : null;
        })()
      )}

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

      {/* ── Zoom / pan overlay controls ───────────────────────────────────── */}
      <div
        className="absolute bottom-9 right-4 flex flex-col gap-1 z-10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          title="Zoom in (Ctrl+Shift++)"
          onClick={onZoomIn}
          className="w-8 h-8 rounded bg-panel border border-border-ui text-content text-base font-bold
                     hover:bg-secondary active:bg-secondary-active flex items-center justify-center leading-none"
        >
          +
        </button>
        <button
          title="Zoom out (Ctrl+Shift+-)"
          onClick={onZoomOut}
          className="w-8 h-8 rounded bg-panel border border-border-ui text-content text-base font-bold
                     hover:bg-secondary active:bg-secondary-active flex items-center justify-center leading-none"
        >
          −
        </button>
        <button
          title={`Fit to view (Ctrl+0)${fitted ? " — active" : ""}`}
          onClick={onFit}
          className={`w-8 h-8 rounded border text-[11px] font-bold flex items-center justify-center leading-none
            ${
              fitted
                ? "bg-accent border-accent text-white"
                : "bg-panel border-border-ui text-content hover:bg-secondary"
            }`}
        >
          ⊡
        </button>
      </div>

      {/* ── Ruler overlay — screen-space, always crisp ──────────────────── */}
      {containerSize.w > 0 && (
        <RulerOverlay
          vp={vp}
          bedW={bedW}
          bedH={bedH}
          origin={config?.origin ?? "bottom-left"}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      )}

      {/* ── Zoom-level badge ─────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-10 text-[10px] text-content-faint font-mono pointer-events-none">
        {Math.round(vp.zoom * 100)}%
      </div>

      {/* ── Space-pan hint ────────────────────────────────────────────────── */}
      {spaceDown && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-center pt-3">
          <span className="text-[10px] text-content-muted bg-app/80 px-2 py-0.5 rounded">
            Pan mode · drag to pan · release Space to exit
          </span>
        </div>
      )}
    </div>
  );
}
