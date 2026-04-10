import { useCallback, useEffect, type RefObject } from "react";
import { useCanvasStore } from "../../../store/canvasStore";

interface UseCanvasGestureLifecycleOptions {
  dragging: unknown;
  scaling: unknown;
  rotating: unknown;
  groupScaling: unknown;
  groupRotating: unknown;
  groupOBBAngle: number;
  panStartRef: RefObject<unknown>;
  justDraggedRef: RefObject<boolean>;
  updatePanMove: (e: MouseEvent) => boolean;
  updateDragMove: (e: MouseEvent) => void;
  updateScaleMove: (e: MouseEvent) => void;
  updateRotateMove: (e: MouseEvent) => void;
  updateGroupScaleMove: (e: MouseEvent) => void;
  updateGroupRotateMove: (e: MouseEvent) => void;
  endDrag: () => boolean;
  endScale: () => void;
  endRotate: () => void;
  endGroupRotating: (finalOBBAngle: number) => void;
  clearGroupOBB: () => void;
  endGroupScaling: () => void;
  endPan: () => void;
}

export function useCanvasGestureLifecycle({
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
}: UseCanvasGestureLifecycleOptions) {
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
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
    useCanvasStore.getState().commitGesture();

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
    endGroupRotating(groupOBBAngle);
    if (wasGroupDrag) clearGroupOBB();
    endGroupScaling();
    endPan();
  }, [
    dragging,
    scaling,
    rotating,
    groupScaling,
    groupRotating,
    panStartRef,
    justDraggedRef,
    endDrag,
    endScale,
    endRotate,
    endGroupRotating,
    groupOBBAngle,
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
}
