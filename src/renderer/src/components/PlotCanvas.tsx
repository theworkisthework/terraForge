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
import { useRef, useEffect, useState, useCallback } from "react";
import { Crosshair } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../store/canvasStore";
import {
  selectPlotCanvasCanvasState,
  selectPlotCanvasHandleOverlayState,
  selectPlotCanvasToolpathState,
} from "../store/canvasSelectors";
import { useMachineStore } from "../store/machineStore";
import { usePlotProgress } from "../utils/usePlotProgress";
import { DEFAULT_STROKE_WIDTH_MM, type SvgImport } from "../../../types";
import {
  MM_TO_PX,
  PAD,
  ZOOM_STEP,
  ROTATE_CURSOR,
  type HandlePos,
  type Vp,
  scaleHexColor,
  BedLayer,
  GridLayer,
  SelectionOverlay,
  ToolpathOverlay,
  useViewport,
  useCanvasPanZoom,
} from "../features/canvas";
import {
  useSpaceKeyPan,
  useObjectDrag,
  useObjectScaleRotate,
  useGroupOBB,
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

  // Tracks the last known WCO (work-coordinate offset) from raw FluidNC status.
  // WPos = MPos − WCO, computed here the same way as in usePlotProgress so the
  // crosshair stays on the correct work position even when FluidNC only sends MPos.
  const penWcoRef = useRef({ x: 0, y: 0, z: 0 });

  // ── Pan state ─────────────────────────────────────────────────────────────────
  // ── useSpaceKeyPan ─── space-key pan mode + pan gesture state machine ────────
  const {
    spaceDown,
    spaceRef,
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
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Delete / Backspace → remove selected item
      if (e.key === "Delete" || e.key === "Backspace") {
        if (allImportsSelected) {
          clearImports();
        } else if (selectedGroupId) {
          const st = useCanvasStore.getState();
          const groupImportIds = new Set(
            st.layerGroups.find((g) => g.id === selectedGroupId)?.importIds ??
              [],
          );
          st.imports
            .filter((i) => groupImportIds.has(i.id))
            .forEach((i) => st.removeImport(i.id));
          selectGroup(null);
        } else if (selectedImportId) {
          removeImport(selectedImportId);
        } else if (toolpathSelected && !isJobActive) {
          setGcodeToolpath(null);
          // selectedJobFile is cleared by the gcodeToolpath→null effect below.
        }
      }

      // Escape → deselect
      if (e.key === "Escape") {
        selectImport(null);
        selectToolpath(false);
      }

      // Ctrl/Cmd + Shift + + / - → keyboard zoom
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomBy(ZOOM_STEP);
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          zoomBy(1 / ZOOM_STEP);
        }
      }

      // Ctrl/Cmd + 0 → fit to view
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        fitToView();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    selectedImportId,
    allImportsSelected,
    selectedGroupId,
    selectGroup,
    toolpathSelected,
    isJobActive,
    removeImport,
    clearImports,
    selectImport,
    selectToolpath,
    setGcodeToolpath,
    zoomBy,
    fitToView,
  ]);

  // ── Clear selectedJobFile when the toolpath is removed ─────────────────────
  // Detects the non-null → null transition so clearing the toolpath (via the
  // ✕ button, Delete key, or any other path) always resets the job panel.
  const prevGcodeToolpathRef = useRef(gcodeToolpath);
  useEffect(() => {
    const prev = prevGcodeToolpathRef.current;
    prevGcodeToolpathRef.current = gcodeToolpath;
    if (prev !== null && gcodeToolpath === null) {
      setSelectedJobFile(null);
    }
  }, [gcodeToolpath, setSelectedJobFile]);

  // ── Sync toolpathSelected ↔ selectedJobFile ───────────────────────────────────
  // One central effect keeps the file browser and job panel in lock-step with
  // the canvas toolpath selection (and vice versa).
  //   selecting   → restore selectedJobFile from gcodeSource
  //   deselecting → clear selectedJobFile only if it was pointing at gcodeSource
  useEffect(() => {
    if (toolpathSelected && gcodeSource) {
      setSelectedJobFile({
        path: gcodeSource.path,
        name: gcodeSource.name,
        source: gcodeSource.source,
      });
    } else if (!toolpathSelected && gcodeSource) {
      const current = useMachineStore.getState().selectedJobFile;
      // Only clear selectedJobFile when the toolpath came from a local file.
      // Remote-file selections (sd/fs) from the file browser should persist
      // independently of canvas toolpath selection state.
      if (
        current?.path === gcodeSource.path &&
        gcodeSource.source === "local"
      ) {
        setSelectedJobFile(null);
      }
    }
    // Intentionally only re-run when toolpathSelected changes; gcodeSource
    // changing means a new toolpath was loaded which resets toolpathSelected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolpathSelected]);

  // ── SVG coordinate helpers (map machine-mm → canvas SVG px) ─────────────────
  // Y: bottom-origins flip so mm=0 is at the bottom of the bed rectangle.
  const getBedY = (mmY: number) =>
    isBottom ? canvasH - PAD - mmY * MM_TO_PX : PAD + mmY * MM_TO_PX;
  // X: right-origins flip so mm=0 is at the right of the bed rectangle.
  const getBedX = (mmX: number) =>
    isRight ? PAD + (bedW - mmX) * MM_TO_PX : PAD + mmX * MM_TO_PX;

  // ── Unified window mousemove / mouseup ────────────────────────────────────────
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      // Pan takes priority; if consumed, stop processing other gestures.
      if (updatePanMove(e)) return;
      updateDragMove(e);
      updateScaleMove(e);
      updateRotateMove(e);
      updateGroupScaleMove(e);
      updateGroupRotateMove(e);
    },
    [
      updatePanMove,
      updateDragMove,
      updateScaleMove,
      updateRotateMove,
      updateGroupScaleMove,
      updateGroupRotateMove,
    ],
  );

  const onMouseUp = useCallback(() => {
    // Commit gesture snapshot to undo stack (only if imports actually changed).
    useCanvasStore.getState().commitGesture();
    // If any gesture was active, mark justDraggedRef so SVG onClick can ignore
    // the synthetic click that the browser fires after mouseup.
    if (
      dragging ||
      scaling ||
      rotating ||
      groupScaling ||
      groupRotating ||
      panStartRef.current
    ) {
      justDraggedRef.current = true;
    }
    const wasGroupDrag = endDrag();
    endScale();
    endRotate();
    // Persist OBB after rotation; scale/drag discard it.
    endGroupRotating(groupOBBAngle);
    if (wasGroupDrag) clearGroupOBB(); // drag changed geometry
    endGroupScaling(); // scale also discards OBB
    endPan();
  }, [
    dragging,
    scaling,
    rotating,
    groupScaling,
    groupRotating,
    groupOBBAngle,
    panStartRef,
    justDraggedRef,
    endDrag,
    endScale,
    endRotate,
    endGroupRotating,
    clearGroupOBB,
    endGroupScaling,
    endPan,
  ]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── Container mousedown — middle mouse + Space+drag pan ───────────────────────
  const onContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        // Middle mouse → pan
        e.preventDefault();
        startPan(e.clientX, e.clientY);
      } else if (e.button === 0 && spaceRef.current) {
        // Space + left click → pan
        e.preventDefault();
        startPan(e.clientX, e.clientY);
      }
    },
    [startPan],
  );

  // Suppress browser context-menu on middle-click release
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => e.preventDefault(),
    [],
  );

  // ── Overlay button handlers ───────────────────────────────────────────────────
  const onZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      zoomBy(ZOOM_STEP);
    },
    [zoomBy],
  );
  const onZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      zoomBy(1 / ZOOM_STEP);
    },
    [zoomBy],
  );
  const onFit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fitToView();
    },
    [fitToView],
  );

  // ── Toolpath canvas overlay — see ToolpathOverlay component below ────────────

  // ── Cursor ────────────────────────────────────────────────────────────────────
  const cursor = spaceDown
    ? isPanning
      ? "grabbing"
      : "grab"
    : isPanning
      ? "grabbing"
      : rotating
        ? ROTATE_CURSOR
        : undefined;

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

        {/* Page template overlay — non-interactive amber dashed rectangle
             showing the chosen paper size relative to the machine origin.
             Hidden from the layers panel; cannot be selected or edited. */}
        {pageTemplate &&
          (() => {
            const activeSize = pageSizes.find(
              (ps) => ps.id === pageTemplate.sizeId,
            );
            if (!activeSize) return null;
            const pgW = pageTemplate.landscape
              ? activeSize.heightMM
              : activeSize.widthMM;
            const pgH = pageTemplate.landscape
              ? activeSize.widthMM
              : activeSize.heightMM;
            // Convert page corners from machine mm to SVG canvas px.
            const svgX0 = getBedX(0);
            const svgX1 = getBedX(pgW);
            const svgY0 = getBedY(pgH); // top edge (H mm from origin)
            const svgY1 = getBedY(0); // origin edge
            const rectX = Math.min(svgX0, svgX1);
            const rectY = Math.min(svgY0, svgY1);
            const rectW = Math.abs(svgX1 - svgX0);
            const rectH = Math.abs(svgY1 - svgY0);
            const label = `${activeSize.name} ${pageTemplate.landscape ? "Landscape" : "Portrait"}`;
            // Keep label at a fixed ~11px screen size regardless of zoom level.
            const labelSize = 11 / vp.zoom;
            // Margin inset rect (in SVG px).
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
          })()}

        {/* G-code toolpath hit-area (paths rendered on the canvas overlay below). */}
        {gcodeToolpath &&
          (() => {
            const { minX, maxX, minY, maxY } = gcodeToolpath.bounds;
            return (
              <>
                <g
                  transform={`translate(${
                    isCenter
                      ? PAD + (bedW / 2) * MM_TO_PX
                      : isRight
                        ? PAD + bedW * MM_TO_PX
                        : PAD
                  }, ${
                    isCenter
                      ? PAD + (bedH / 2) * MM_TO_PX
                      : isBottom
                        ? PAD + bedH * MM_TO_PX
                        : PAD
                  }) scale(${isRight ? -MM_TO_PX : MM_TO_PX}, ${isCenter || isBottom ? -MM_TO_PX : MM_TO_PX})`}
                >
                  {/* Invisible hit-area for selecting the toolpath */}
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
                      // selectedJobFile is synced by the toolpathSelected effect below.
                    }}
                  />
                </g>

                {toolpathSelected && (
                  <g pointerEvents="none" /> /* selection rendered in overlay SVG */
                )}
              </>
            );
          })()}

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

      {/* ── Toolpath selection overlay — screen-pixel space ─────────────── */}
      {gcodeToolpath &&
        toolpathSelected &&
        containerSize.w > 0 &&
        (() => {
          const { minX, maxX, minY, maxY } = gcodeToolpath.bounds;
          const svgL = isCenter
            ? PAD + (bedW / 2 + minX) * MM_TO_PX
            : isRight
              ? PAD + (bedW - maxX) * MM_TO_PX
              : PAD + minX * MM_TO_PX;
          const svgR = isCenter
            ? PAD + (bedW / 2 + maxX) * MM_TO_PX
            : isRight
              ? PAD + (bedW - minX) * MM_TO_PX
              : PAD + maxX * MM_TO_PX;
          const svgT = isCenter
            ? PAD + (bedH / 2 - maxY) * MM_TO_PX
            : isBottom
              ? PAD + (bedH - maxY) * MM_TO_PX
              : PAD + minY * MM_TO_PX;
          const svgB = isCenter
            ? PAD + (bedH / 2 - minY) * MM_TO_PX
            : isBottom
              ? PAD + (bedH - minY) * MM_TO_PX
              : PAD + maxY * MM_TO_PX;
          const sl = svgL * vp.zoom + vp.panX;
          const sr = svgR * vp.zoom + vp.panX;
          const st = svgT * vp.zoom + vp.panY;
          const sb = svgB * vp.zoom + vp.panY;
          const delSx = sr + 14;
          const delSy = st - 14;
          const TP_HALF = 8;
          const TP_PIP = 2.5;
          return (
            <svg
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
                zIndex: 4,
              }}
              width={containerSize.w}
              height={containerSize.h}
              viewBox={`0 0 ${containerSize.w} ${containerSize.h}`}
            >
              <rect
                x={sl}
                y={st}
                width={sr - sl}
                height={sb - st}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1}
                strokeDasharray="5 3"
                pointerEvents="none"
              />
              {(
                [
                  [sl, st],
                  [sr, st],
                  [sl, sb],
                  [sr, sb],
                ] as [number, number][]
              ).map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r={TP_PIP} fill="#38bdf8" />
              ))}
              {!isJobActive && (
                <g
                  transform={`translate(${delSx},${delSy})`}
                  style={{ cursor: "pointer", pointerEvents: "all" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGcodeToolpath(null);
                    if (selectedJobFile?.source === "local")
                      setSelectedJobFile(null);
                  }}
                >
                  <svg
                    x={-TP_HALF}
                    y={-TP_HALF}
                    width={TP_HALF * 2}
                    height={TP_HALF * 2}
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      width="18"
                      height="18"
                      x="3"
                      y="3"
                      rx="2"
                      ry="2"
                      fill="var(--tf-accent)"
                      stroke="none"
                    />
                    <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
                    <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
                  </svg>
                </g>
              )}
            </svg>
          );
        })()}

      {/* ── Pen position crosshair ─────────────────────────────────────── */}
      {connected &&
        machineStatus &&
        containerSize.w > 0 &&
        (() => {
          // Keep WCO up to date (FluidNC sends it periodically, not every packet).
          const wcoMatch = machineStatus.raw?.match(
            /WCO:([-\d.]+),([-\d.]+),([-\d.]+)/,
          );
          if (wcoMatch) {
            penWcoRef.current = {
              x: +wcoMatch[1],
              y: +wcoMatch[2],
              z: +wcoMatch[3],
            };
          }
          // Prefer WPos: when FluidNC sends it; otherwise derive from MPos − WCO.
          const hasWPos =
            /WPos:/.test(machineStatus.raw ?? "") && machineStatus.wpos != null;
          const penX = hasWPos
            ? machineStatus.wpos!.x
            : machineStatus.mpos.x - penWcoRef.current.x;
          const penY = hasWPos
            ? machineStatus.wpos!.y
            : machineStatus.mpos.y - penWcoRef.current.y;
          // Convert machine-mm → canvas SVG px (same transform used by the toolpath g).
          const svgX = isCenter
            ? PAD + (bedW / 2 + penX) * MM_TO_PX
            : isRight
              ? PAD + (bedW - penX) * MM_TO_PX
              : PAD + penX * MM_TO_PX;
          const svgY = isCenter
            ? PAD + (bedH / 2 - penY) * MM_TO_PX
            : isBottom
              ? PAD + (bedH - penY) * MM_TO_PX
              : PAD + penY * MM_TO_PX;
          // Map canvas SVG px → screen px via current viewport transform.
          const sx = vp.panX + svgX * vp.zoom;
          const sy = vp.panY + svgY * vp.zoom;
          return (
            <div
              style={{
                position: "absolute",
                left: sx,
                top: sy,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 5,
                color: "#22c55e",
                opacity: 0.9,
                filter: "drop-shadow(0 0 3px #15803d)",
              }}
            >
              <Crosshair size={24} strokeWidth={1.5} />
            </div>
          );
        })()}

      {/* ── Pen position crosshair ────────────────────────────────────────── */}
      {connected &&
        machineStatus &&
        containerSize.w > 0 &&
        (() => {
          // Keep WCO up to date (FluidNC sends it periodically, not every packet).
          const wcoMatch = machineStatus.raw?.match(
            /WCO:([-\d.]+),([-\d.]+),([-\d.]+)/,
          );
          if (wcoMatch) {
            penWcoRef.current = {
              x: +wcoMatch[1],
              y: +wcoMatch[2],
              z: +wcoMatch[3],
            };
          }
          // Prefer WPos: when FluidNC reports it; otherwise derive from MPos − WCO.
          const hasWPos =
            /WPos:/.test(machineStatus.raw ?? "") && machineStatus.wpos != null;
          const penX = hasWPos
            ? machineStatus.wpos!.x
            : machineStatus.mpos.x - penWcoRef.current.x;
          const penY = hasWPos
            ? machineStatus.wpos!.y
            : machineStatus.mpos.y - penWcoRef.current.y;
          // Convert machine-mm → canvas SVG px (mirrors the toolpath <g> transform).
          const svgX = isCenter
            ? PAD + (bedW / 2 + penX) * MM_TO_PX
            : isRight
              ? PAD + (bedW - penX) * MM_TO_PX
              : PAD + penX * MM_TO_PX;
          const svgY = isCenter
            ? PAD + (bedH / 2 - penY) * MM_TO_PX
            : isBottom
              ? PAD + (bedH - penY) * MM_TO_PX
              : PAD + penY * MM_TO_PX;
          // Map canvas SVG px → screen px via current viewport transform.
          const sx = vp.panX + svgX * vp.zoom;
          const sy = vp.panY + svgY * vp.zoom;
          return (
            <div
              style={{
                position: "absolute",
                left: sx,
                top: sy,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 5,
                color: "#22c55e",
                opacity: 0.9,
                filter: "drop-shadow(0 0 3px #15803d)",
              }}
            >
              <Crosshair size={24} strokeWidth={1.5} />
            </div>
          );
        })()}

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

// ─── Ruler overlay — renders in screen space so text is always native res ─────
//
// X ruler: bottom edge for bottom-left origin, top edge for top-left origin.
// Y ruler: always on the left edge.
// Ticks point INTO the canvas; labels are centered inside their strip.
// Y labels are rotated 90° so they fit the narrow strip without truncation.

const RULER_W = 20; // ruler strip width in screen pixels

interface RulerOverlayProps {
  vp: Vp;
  bedW: number;
  bedH: number;
  origin: "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center";
  containerW: number;
  containerH: number;
}

function RulerOverlay({
  vp,
  bedW,
  bedH,
  origin,
  containerW,
  containerH,
}: RulerOverlayProps) {
  const isBottom = origin === "bottom-left" || origin === "bottom-right";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isCenter = origin === "center";
  const R = RULER_W;

  // ── Coordinate conversions ────────────────────────────────────────────────
  // Center: machine (0,0) at centre of bed; X right, Y up.
  // Right-origins: X mirrors (mm=0 at right edge).
  // Bottom-origins: Y mirrors (mm=0 at bottom edge).
  const mmToSx = (mm: number) =>
    isCenter
      ? vp.panX + (PAD + (bedW / 2 + mm) * MM_TO_PX) * vp.zoom
      : isRight
        ? vp.panX + (PAD + (bedW - mm) * MM_TO_PX) * vp.zoom
        : vp.panX + (PAD + mm * MM_TO_PX) * vp.zoom;
  const mmToSy = (mm: number) =>
    isCenter
      ? vp.panY + (PAD + (bedH / 2 - mm) * MM_TO_PX) * vp.zoom
      : isBottom
        ? vp.panY + (PAD + (bedH - mm) * MM_TO_PX) * vp.zoom
        : vp.panY + (PAD + mm * MM_TO_PX) * vp.zoom;
  const sxToMm = (sx: number) => {
    const raw = ((sx - vp.panX) / vp.zoom - PAD) / MM_TO_PX;
    if (isCenter) return raw - bedW / 2;
    return isRight ? bedW - raw : raw;
  };
  const syToMm = (sy: number) => {
    const raw = ((sy - vp.panY) / vp.zoom - PAD) / MM_TO_PX;
    if (isCenter) return bedH / 2 - raw;
    return isBottom ? bedH - raw : raw;
  };

  // ── Adaptive tick density (~40–100 px between major ticks on screen) ──────
  const pxPerMm = vp.zoom * MM_TO_PX;
  const [major, minor] =
    pxPerMm >= 30
      ? [5, 1]
      : pxPerMm >= 12
        ? [10, 2]
        : pxPerMm >= 6
          ? [20, 5]
          : pxPerMm >= 2
            ? [50, 10]
            : pxPerMm >= 0.8
              ? [100, 20]
              : [200, 50];

  const makeTicks = (
    a: number,
    b: number,
    minMm: number,
    maxMm: number,
  ): number[] => {
    const lo = Math.ceil(Math.min(a, b) / minor) * minor;
    const hi = Math.floor(Math.max(a, b) / minor) * minor;
    const out: number[] = [];
    for (let mm = lo; mm <= hi; mm += minor)
      if (mm >= minMm && mm <= maxMm) out.push(mm);
    return out;
  };

  // ── Layout: X ruler strip (bottom-origins → bottom edge; top-origins → top edge) ──
  const xSepY = isBottom || isCenter ? containerH - R : R;
  const xTickDir = isBottom || isCenter ? 1 : -1; // into the strip
  const xLabelY = isBottom || isCenter ? containerH - R / 2 : R / 2;

  // ── Layout: Y ruler strip (right-origins → right edge; left-origins → left edge) ──
  const ySepX = isRight ? containerW - R : R;
  const yTickDir = isRight ? 1 : -1; // into the strip
  const yLabelX = isRight ? containerW - R / 2 : R / 2;
  const yStripEdgeX = isRight ? containerW - R : 0;
  const yStripTopY = isBottom || isCenter ? 0 : R;
  const yStripBotY = isBottom || isCenter ? containerH - R : containerH;

  // ── Tick ranges ───────────────────────────────────────────────────────────
  const xTickEdge = isRight ? containerW - R : containerW;
  const xBedMin = isCenter ? -bedW / 2 : 0;
  const xBedMax = isCenter ? bedW / 2 : bedW;
  const yBedMin = isCenter ? -bedH / 2 : 0;
  const yBedMax = isCenter ? bedH / 2 : bedH;
  const xTicks = makeTicks(sxToMm(R), sxToMm(xTickEdge), xBedMin, xBedMax);
  const yTicks = makeTicks(
    syToMm(yStripTopY),
    syToMm(yStripBotY),
    yBedMin,
    yBedMax,
  );

  // ── Visuals ───────────────────────────────────────────────────────────────
  const TICK_COL = "var(--tf-border)";
  const LABEL_COL = "var(--tf-text-muted)";
  const ORIGIN_COL = "var(--tf-accent)";
  const BG = "var(--tf-bg-app)";
  const FONT = 9;
  const MAJOR_LEN = Math.round(R * 0.4);
  const MINOR_LEN = Math.round(R * 0.2);

  // Origin dot — visible in the canvas area (between the ruler strips)
  const originSx = mmToSx(0);
  const originSy = mmToSy(0);
  const originVisible =
    originSx >= R &&
    originSx <= containerW - R &&
    originSy >= yStripTopY &&
    originSy <= yStripBotY;

  // Corner square position
  const cornerX = isRight ? containerW - R : 0;
  const cornerY = isBottom || isCenter ? containerH - R : 0;

  // X separator spans between the Y strips
  const xSepX1 = isRight ? 0 : R;
  const xSepX2 = isRight ? containerW - R : containerW;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: containerW,
        height: containerH,
        overflow: "hidden",
        zIndex: 15,
      }}
      pointerEvents="none"
    >
      {/* ── Strip backgrounds ─────────────────────────────────────────────── */}
      <rect
        x={xSepX1}
        y={isBottom || isCenter ? containerH - R : 0}
        width={xSepX2 - xSepX1}
        height={R}
        fill={BG}
      />
      <rect
        x={yStripEdgeX}
        y={yStripTopY}
        width={R}
        height={yStripBotY - yStripTopY}
        fill={BG}
      />
      <rect x={cornerX} y={cornerY} width={R} height={R} fill={BG} />

      {/* ── Separator lines ───────────────────────────────────────────────── */}
      <line
        x1={xSepX1}
        y1={xSepY}
        x2={xSepX2}
        y2={xSepY}
        stroke={TICK_COL}
        strokeWidth={0.5}
      />
      <line
        x1={ySepX}
        y1={yStripTopY}
        x2={ySepX}
        y2={yStripBotY}
        stroke={TICK_COL}
        strokeWidth={0.5}
      />

      {/* ── X ticks ───────────────────────────────────────────────────────── */}
      {xTicks.map((mm) => {
        const sx = mmToSx(mm);
        if (sx < R || sx > xTickEdge) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        return (
          <g key={`rx-${mm}`}>
            <line
              x1={sx}
              y1={xSepY}
              x2={sx}
              y2={xSepY + xTickDir * tLen}
              stroke={col}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                x={sx}
                y={xLabelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={mm === 0 ? ORIGIN_COL : LABEL_COL}
                fontSize={FONT}
                fontFamily="monospace"
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Y ticks ───────────────────────────────────────────────────────── */}
      {yTicks.map((mm) => {
        const sy = mmToSy(mm);
        if (sy < yStripTopY || sy > yStripBotY) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        return (
          <g key={`ry-${mm}`}>
            <line
              x1={ySepX}
              y1={sy}
              x2={ySepX + yTickDir * tLen}
              y2={sy}
              stroke={col}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                transform={`rotate(-90, ${yLabelX}, ${sy})`}
                x={yLabelX}
                y={sy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={mm === 0 ? ORIGIN_COL : LABEL_COL}
                fontSize={FONT}
                fontFamily="monospace"
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Origin dot ────────────────────────────────────────────────────── */}
      {originVisible && (
        <circle
          data-testid="origin-marker"
          cx={originSx}
          cy={originSy}
          r={3}
          fill={ORIGIN_COL}
          opacity={0.9}
        />
      )}
    </svg>
  );
}

// ─── Per-import SVG layer (paths only — handles are in HandleOverlay) ──────────

interface ImportLayerProps {
  imp: SvgImport;
  selected: boolean;
  onImportMouseDown: (e: React.MouseEvent, id: string) => void;
  getBedY: (mm: number) => number;
}

function ImportLayer({
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

  // Centre of the (unrotated) bounding box in SVG canvas coords
  const cxSvg = left + bboxW / 2;
  const cySvg = top + bboxH / 2;
  const deg = imp.rotation ?? 0;

  // group transform: centre → rotate → scale(sx,sy) → offset to SVG user-unit centre
  const groupTransform = [
    `translate(${cxSvg}, ${cySvg})`,
    `rotate(${deg})`,
    `scale(${sX}, ${sY})`,
    `translate(${-(vbX + imp.svgWidth / 2)}, ${-(vbY + imp.svgHeight / 2)})`,
  ].join(" ");

  return (
    <g>
      {/* Draggable group — paths only; handles are rendered in HandleOverlay */}
      <g
        transform={groupTransform}
        onMouseDown={(e) => onImportMouseDown(e, imp.id)}
        style={{ cursor: "grab" }}
      >
        {/* Paths rendered on canvas overlay — no SVG <path> elements here */}
        {/* Hit-test rect covering the whole viewBox */}
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

// ─── Group handle overlay ─ single AABB around all selected imports ──────────
interface GroupHandleOverlayProps {
  imports: SvgImport[];
  zoom: number;
  panX: number;
  panY: number;
  containerW: number;
  containerH: number;
  getBedY: (mm: number) => number;
  onGroupMouseDown: (e: React.MouseEvent<SVGRectElement>) => void;
  onGroupHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    handle: HandlePos,
  ) => void;
  onGroupRotateHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    gCx: number,
    gCy: number,
    gHW: number,
    gHH: number,
  ) => void;
  onDelete: () => void;
  /** When a rotation gesture is active, render an OBB instead of AABB. */
  activeOBB?: {
    gCx: number;
    gCy: number;
    gHW: number;
    gHH: number;
    angle: number;
  };
}

function GroupHandleOverlay({
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

  // World (SVG canvas) → screen (CSS pixel) transform
  const w2s = (x: number, y: number): [number, number] => [
    x * zoom + panX,
    y * zoom + panY,
  ];

  // Shared cursor map used by both OBB and AABB paths
  type HEntry = [HandlePos, number, number];
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

  // Shared delete-button SVG markup
  const deleteIcon = (
    <svg
      x={-DEL_HALF_PX}
      y={-DEL_HALF_PX}
      width={DEL_HALF_PX * 2}
      height={DEL_HALF_PX * 2}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        width="18"
        height="18"
        x="3"
        y="3"
        rx="2"
        ry="2"
        fill="var(--tf-accent)"
        stroke="none"
      />
      <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
      <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
    </svg>
  );

  // ── OBB path: active during a rotation gesture ───────────────────────────
  // Instead of a recomputed axis-aligned box, we rotate the initial AABB
  // (captured at gesture start) by the current angle delta using an SVG
  // transform, so the box visually rotates with the group.
  if (activeOBB) {
    const { gCx: oCx, gCy: oCy, gHW: oHW, gHH: oHH, angle } = activeOBB;
    const [pivotSx, pivotSy] = w2s(oCx, oCy);
    const hw = oHW * zoom;
    const hh = oHH * zoom;
    const rotHy = pivotSy - hh - ROTATE_STEM_PX;
    const delX = pivotSx + hw + DEL_OFFSET_PX * 0.7;
    const delY = pivotSy - hh - DEL_OFFSET_PX * 0.7;
    const obbHandles: HEntry[] = [
      ["tl", pivotSx - hw, pivotSy - hh],
      ["t", pivotSx, pivotSy - hh],
      ["tr", pivotSx + hw, pivotSy - hh],
      ["r", pivotSx + hw, pivotSy],
      ["br", pivotSx + hw, pivotSy + hh],
      ["b", pivotSx, pivotSy + hh],
      ["bl", pivotSx - hw, pivotSy + hh],
      ["l", pivotSx - hw, pivotSy],
    ];
    return (
      <svg
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 5,
        }}
        width={containerW}
        height={containerH}
        viewBox={`0 0 ${containerW} ${containerH}`}
      >
        {/* Entire OBB is rendered inside a rotated <g> so the box and all
            handles visually rotate with the group. */}
        <g transform={`rotate(${angle}, ${pivotSx}, ${pivotSy})`}>
          {/* Dashed OBB outline */}
          <rect
            x={pivotSx - hw}
            y={pivotSy - hh}
            width={hw * 2}
            height={hh * 2}
            fill="none"
            stroke="var(--tf-accent)"
            strokeWidth={1}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
          {/* Drag hit area */}
          <rect
            x={pivotSx - hw}
            y={pivotSy - hh}
            width={hw * 2}
            height={hh * 2}
            fill="transparent"
            style={{ cursor: "grab", pointerEvents: "all" }}
            onMouseDown={onGroupMouseDown}
          />
          {/* Rotation stem */}
          <line
            x1={pivotSx}
            y1={pivotSy - hh}
            x2={pivotSx}
            y2={rotHy}
            stroke="var(--tf-accent)"
            strokeWidth={1}
            pointerEvents="none"
          />
          {/* Rotation handle */}
          <circle
            cx={pivotSx}
            cy={rotHy}
            r={HANDLE_SCREEN_R}
            fill="var(--tf-accent)"
            stroke="white"
            strokeWidth={1.5}
            style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
            onMouseDown={(e) =>
              onGroupRotateHandleMouseDown(e, oCx, oCy, oHW, oHH)
            }
          />
          {/* 8 scale handles */}
          {obbHandles.map(([id, sx, sy]) => (
            <circle
              key={id}
              cx={sx}
              cy={sy}
              r={HANDLE_SCREEN_R}
              fill="white"
              stroke="var(--tf-accent)"
              strokeWidth={1.5}
              style={{ cursor: cursorMap[id], pointerEvents: "all" }}
              onMouseDown={(e) => onGroupHandleMouseDown(e, id)}
            />
          ))}
          {/* Delete button */}
          <g
            data-testid="group-handle-delete"
            transform={`translate(${delX}, ${delY})`}
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            {deleteIcon}
          </g>
        </g>
      </svg>
    );
  }

  // ── AABB path: default (no active rotation gesture) ─────────────────────────
  // Compute axis-aligned bounding box in SVG *world* coords first,
  // so geometry callbacks can reference the same coordinate system.
  let minWx = Infinity,
    maxWx = -Infinity;
  let minWy = Infinity,
    maxWy = -Infinity;

  for (const imp of imports) {
    const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
    const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
    const left = PAD + imp.x * MM_TO_PX;
    const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
    const bboxW = imp.svgWidth * sX;
    const bboxH = imp.svgHeight * sY;
    const cxSvg = left + bboxW / 2;
    const cySvg = top + bboxH / 2;
    const hw = bboxW / 2;
    const hh = bboxH / 2;
    const rad = ((imp.rotation ?? 0) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    for (const [ox, oy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as [number, number][]) {
      const wx = cxSvg + ox * cosA - oy * sinA;
      const wy = cySvg + ox * sinA + oy * cosA;
      if (wx < minWx) minWx = wx;
      if (wx > maxWx) maxWx = wx;
      if (wy < minWy) minWy = wy;
      if (wy > maxWy) maxWy = wy;
    }
  }

  const BBOX_PAD_W = 6 / zoom; // extra padding in world px (zoom-invariant screen px)
  minWx -= BBOX_PAD_W;
  maxWx += BBOX_PAD_W;
  minWy -= BBOX_PAD_W;
  maxWy += BBOX_PAD_W;

  const gCx = (minWx + maxWx) / 2;
  const gCy = (minWy + maxWy) / 2;
  const gHW = (maxWx - minWx) / 2;
  const gHH = (maxWy - minWy) / 2;

  // Convert AABB corners/edges to screen coords
  const [tlSx, tlSy] = w2s(minWx, minWy);
  const [trSx, trSy] = w2s(maxWx, minWy);
  const [brSx, brSy] = w2s(maxWx, maxWy);
  const [blSx, blSy] = w2s(minWx, maxWy);
  const [tcSx, tcSy] = w2s(gCx, minWy);
  const [bcSx, bcSy] = w2s(gCx, maxWy);
  const [lcSx, lcSy] = w2s(minWx, gCy);
  const [rcSx, rcSy] = w2s(maxWx, gCy);

  const handles: HEntry[] = [
    ["tl", tlSx, tlSy],
    ["t", tcSx, tcSy],
    ["tr", trSx, trSy],
    ["r", rcSx, rcSy],
    ["br", brSx, brSy],
    ["b", bcSx, bcSy],
    ["bl", blSx, blSy],
    ["l", lcSx, lcSy],
  ];

  // Rotation handle: ROTATE_STEM_PX screen px above top-centre
  const rotHx = tcSx;
  const rotHy = tcSy - ROTATE_STEM_PX;

  // Delete button: diagonal from top-right corner
  const delSx = trSx + DEL_OFFSET_PX * 0.7;
  const delSy = trSy - DEL_OFFSET_PX * 0.7;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 5,
      }}
      width={containerW}
      height={containerH}
      viewBox={`0 0 ${containerW} ${containerH}`}
    >
      {/* Dashed bounding box outline */}
      <rect
        x={tlSx}
        y={tlSy}
        width={trSx - tlSx}
        height={blSy - tlSy}
        fill="none"
        stroke="var(--tf-accent)"
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />
      {/* Transparent drag hit area (covers interior excluding handles) */}
      <rect
        x={tlSx}
        y={tlSy}
        width={trSx - tlSx}
        height={blSy - tlSy}
        fill="transparent"
        style={{ cursor: "grab", pointerEvents: "all" }}
        onMouseDown={onGroupMouseDown}
      />
      {/* Rotation stem */}
      <line
        x1={tcSx}
        y1={tcSy}
        x2={rotHx}
        y2={rotHy}
        stroke="var(--tf-accent)"
        strokeWidth={1}
        pointerEvents="none"
      />
      {/* Rotation handle */}
      <circle
        cx={rotHx}
        cy={rotHy}
        r={HANDLE_SCREEN_R}
        fill="var(--tf-accent)"
        stroke="white"
        strokeWidth={1.5}
        style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
        onMouseDown={(e) => onGroupRotateHandleMouseDown(e, gCx, gCy, gHW, gHH)}
      />
      {/* 8 scale handles */}
      {handles.map(([id, sx, sy]) => (
        <circle
          key={id}
          cx={sx}
          cy={sy}
          r={HANDLE_SCREEN_R}
          fill="white"
          stroke="var(--tf-accent)"
          strokeWidth={1.5}
          style={{ cursor: cursorMap[id], pointerEvents: "all" }}
          onMouseDown={(e) => onGroupHandleMouseDown(e, id)}
        />
      ))}
      {/* Delete button */}
      <g
        data-testid="group-handle-delete"
        transform={`translate(${delSx},${delSy})`}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg
          x={-DEL_HALF_PX}
          y={-DEL_HALF_PX}
          width={DEL_HALF_PX * 2}
          height={DEL_HALF_PX * 2}
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect
            width="18"
            height="18"
            x="3"
            y="3"
            rx="2"
            ry="2"
            fill="var(--tf-accent)"
            stroke="none"
          />
          <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
          <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
        </svg>
      </g>
    </svg>
  );
}

// ─── Handle overlay ─ renders bounding box + handles in screen-pixel space ───
// A sibling SVG with viewBox="0 0 W H" maps 1 SVG unit = 1 CSS pixel exactly,
// so every radius, strokeWidth and dash value is zoom-independent by definition.

const HANDLE_SCREEN_R = 5; // handle circle radius (screen px)
const ROTATE_STEM_PX = 24; // rotation-handle stem length (screen px)
const DEL_OFFSET_PX = 26; // delete button distance from TR corner (screen px)
const DEL_HALF_PX = 9; // half-size of delete icon (screen px)

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

function HandleOverlay({
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

  // SVG world coords → screen (CSS) pixels
  const w2s = (x: number, y: number): [number, number] => [
    x * zoom + panX,
    y * zoom + panY,
  ];

  // Rotate an offset by deg degrees
  const rotPt = (ox: number, oy: number): [number, number] => {
    const c = Math.cos(degRad);
    const ss = Math.sin(degRad);
    return [ox * c - oy * ss, ox * ss + oy * c];
  };

  // Bounding box as a screen-space polygon
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

  // 8 scale handle definitions
  type HInfo = { id: HandlePos; ox: number; oy: number };
  const HANDLE_DEFS: HInfo[] = [
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

  // Top-centre in screen space
  const [tcDx, tcDy] = rotPt(0, -hh);
  const [topCx, topCy] = w2s(cxSvg + tcDx, cySvg + tcDy);

  // Rotation handle: ROTATE_STEM_PX screen pixels above top-centre, along the
  // rotated outward normal of the top edge — direction (sin θ, −cos θ) in SVG.
  const rotHx = topCx + Math.sin(degRad) * ROTATE_STEM_PX;
  const rotHy = topCy - Math.cos(degRad) * ROTATE_STEM_PX;

  // Delete button: DEL_OFFSET_PX screen pixels from the TR corner along the
  // rotated outward diagonal (bisects both edges at that corner, so it stays
  // at 45° from each edge regardless of rotation).
  const [trDx, trDy] = rotPt(hw, -hh);
  const [trSx, trSy] = w2s(cxSvg + trDx, cySvg + trDy);
  // Unit diagonal in local frame: (+1,−1)/√2; rotated → world unit vector;
  // screen-space travel = worldDir * DEL_OFFSET_PX (zoom cancels in normalisation)
  const [diagDx, diagDy] = rotPt(Math.SQRT1_2, -Math.SQRT1_2);
  const delSx = trSx + diagDx * DEL_OFFSET_PX;
  const delSy = trSy + diagDy * DEL_OFFSET_PX;

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
      {/* Bounding box polygon — 1 px stroke in screen space */}
      <polygon
        data-testid="selection-bbox"
        points={polyPoints}
        fill="none"
        stroke="var(--tf-accent)"
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />

      {/* Centre-of-rotation crosshair — toggled from Properties panel */}
      {showCentreMarker &&
        (() => {
          const [cx, cy] = w2s(cxSvg, cySvg);
          const A = 6; // arm half-length in screen px
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

      {/* 8 scale handles */}
      {HANDLE_DEFS.map(({ id, ox, oy }) => {
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

      {/* Rotation stem */}
      <line
        x1={topCx}
        y1={topCy}
        x2={rotHx}
        y2={rotHy}
        stroke="var(--tf-accent)"
        strokeWidth={1}
        pointerEvents="none"
      />

      {/* Rotation handle */}
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

      {/* Delete button */}
      <g
        data-testid="handle-delete"
        transform={`translate(${delSx},${delSy})`}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg
          x={-DEL_HALF_PX}
          y={-DEL_HALF_PX}
          width={DEL_HALF_PX * 2}
          height={DEL_HALF_PX * 2}
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect
            width="18"
            height="18"
            x="3"
            y="3"
            rx="2"
            ry="2"
            fill="var(--tf-accent)"
            stroke="none"
          />
          <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
          <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
        </svg>
      </g>
    </svg>
  );
}
