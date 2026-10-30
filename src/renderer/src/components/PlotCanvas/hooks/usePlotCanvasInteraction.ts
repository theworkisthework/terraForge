import type { RefObject } from "react";
import {
  useSpaceKeyPan,
  useObjectDrag,
  useObjectScaleRotate,
  useGroupOBB,
  useCanvasKeyboardShortcuts,
  useToolpathSelectionSync,
  useCanvasGestureLifecycle,
  useCanvasInteractionHandlers,
} from "../../../features/canvas";
import type { Vp } from "../../../features/canvas/types";
import type { usePlotCanvasState } from "./usePlotCanvasState";
import type { usePlotCanvasGeometry } from "./usePlotCanvasGeometry";

type PlotCanvasState = ReturnType<typeof usePlotCanvasState>;

/**
 * The canvas's mouse and keyboard handling: panning (space or right/middle
 * drag), dragging, scaling and rotating imports and groups, and keyboard
 * shortcuts. Returns the handlers and gesture state the canvas renders with.
 */
export function usePlotCanvasInteraction({
  containerRef,
  vpRef,
  setVp,
  setFitted,
  zoomBy,
  fitToView,
  state,
  geometry,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  vpRef: RefObject<Vp>;
  setVp: (next: Vp) => void;
  setFitted: (fitted: boolean) => void;
  zoomBy: Parameters<typeof useCanvasKeyboardShortcuts>[0]["zoomBy"];
  fitToView: () => void;
  state: PlotCanvasState;
  geometry: ReturnType<typeof usePlotCanvasGeometry>;
}) {
  const { canvas, toolpath, setSelectedJobFile, isJobActive } = state;
  const { selectedImportId, allImportsSelected, selectedGroupId, selectGroup, selectImport, removeImport, clearImports, updateImport } = canvas;
  const { gcodeToolpath, setGcodeToolpath, gcodeSource, toolpathSelected, selectToolpath } = toolpath;

  // ── useSpaceKeyPan ─── space-key pan mode + pan gesture state machine ────────
  const { spaceDown, spaceRef, setSpacePressed, isPanning, panStartRef, startPan, updatePanMove, endPan } =
    useSpaceKeyPan(vpRef, setVp, setFitted);

  // ── useObjectDrag ─── single / group object drag state machine ───────────────
  const { dragging, justDraggedRef, onImportMouseDown, onGroupMouseDown, updateDragMove, endDrag } = useObjectDrag(
    vpRef,
    spaceRef,
    selectImport,
    updateImport,
    geometry.origin,
  );

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
  } = useGroupOBB(containerRef, vpRef, updateImport, geometry.isBottom, geometry.canvasH, allImportsSelected, selectedGroupId);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  // toolpathSelected and selectToolpath live in canvasStore so PropertiesPanel
  // can react to canvas selection changes (and vice versa).
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

  useToolpathSelectionSync({ gcodeToolpath, gcodeSource, toolpathSelected, setSelectedJobFile });

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

  const handlers = useCanvasInteractionHandlers({ startPan, spaceRef, zoomBy, fitToView, spaceDown, isPanning, rotating });

  return {
    ...handlers,
    spaceDown,
    justDraggedRef,
    onImportMouseDown,
    onGroupMouseDown,
    onHandleMouseDown,
    onRotateHandleMouseDown,
    groupRotating,
    groupOBBAngle,
    persistentGroupOBB,
    onGroupHandleMouseDown,
    onGroupRotateHandleMouseDown,
  };
}
