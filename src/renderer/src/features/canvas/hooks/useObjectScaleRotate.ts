/**
 * useObjectScaleRotate — single-object scale and rotate gesture state machines.
 *
 * Owns:
 *   - scaling: active scale-handle gesture state (null when idle)
 *   - rotating: active rotate-handle gesture state (null when idle)
 *   - onHandleMouseDown: start a scale gesture
 *   - onRotateHandleMouseDown: start a rotate gesture
 *   - updateScaleMove: update scale on each mousemove
 *   - updateRotateMove: update rotation on each mousemove
 *   - endScale: finish the scale gesture
 *   - endRotate: finish the rotate gesture
 */
import { useState, useCallback, type RefObject } from "react";
import { MM_TO_PX } from "../constants";
import type { HandlePos, ScalingState, RotatingState, Vp } from "../types";
import type { SvgImport } from "../../../../../types";
import { useCanvasStore } from "../../../store/canvasStore";
import { canvasPoint, HANDLE_DIRECTIONS } from "../utils/handleGeometry";

/**
 * The scale a handle drag of (dx, dy) canvas pixels gives. With the ratio
 * locked, one uniform scale follows the handle's horizontal pull (its
 * vertical one for the top and bottom edges); unlocked, each axis the handle
 * moves scales on its own. Never below 0.001.
 */
export function scalePatch(
  scaling: ScalingState,
  dx: number,
  dy: number,
): { scale?: number; scaleX?: number; scaleY?: number } {
  const dir = HANDLE_DIRECTIONS[scaling.handle];
  if (scaling.ratioLocked) {
    const delta = dir.x !== 0 ? dir.x * dx : dir.y * dy;
    const dimPx = dir.x === 0 ? scaling.startH : scaling.startW;
    return {
      scale: Math.max(0.001, scaling.startScale * (1 + delta / dimPx)),
      scaleX: undefined,
      scaleY: undefined,
    };
  }
  const patch: { scaleX?: number; scaleY?: number } = {};
  if (dir.x !== 0) patch.scaleX = Math.max(0.001, scaling.startScaleX * (1 + (dir.x * dx) / scaling.startW));
  if (dir.y !== 0) patch.scaleY = Math.max(0.001, scaling.startScaleY * (1 + (dir.y * dy) / scaling.startH));
  return patch;
}

export function useObjectScaleRotate(
  containerRef: RefObject<HTMLDivElement | null>,
  vpRef: RefObject<Vp>,
  updateImport: (id: string, patch: Partial<SvgImport>) => void,
) {
  const [scaling, setScaling] = useState<ScalingState | null>(null);
  const [rotating, setRotating] = useState<RotatingState | null>(null);

  const isNonPrimaryButton = (button: number | undefined) =>
    button !== undefined && button !== 0;

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, id: string, handle: HandlePos) => {
      if (isNonPrimaryButton(e.button)) return;
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const imp = useCanvasStore.getState().imports.find((i) => i.id === id);
      if (!imp) return;
      const sX = imp.scaleX ?? imp.scale;
      const sY = imp.scaleY ?? imp.scale;
      setScaling({
        id,
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startScale: imp.scale,
        startScaleX: sX,
        startScaleY: sY,
        ratioLocked: imp.scaleX === undefined,
        startObjX: imp.x,
        startObjY: imp.y,
        startW: imp.svgWidth * sX * MM_TO_PX,
        startH: imp.svgHeight * sY * MM_TO_PX,
      });
    },
    [],
  );

  const onRotateHandleMouseDown = useCallback(
    (
      e: React.MouseEvent<SVGCircleElement>,
      id: string,
      cxSvg: number,
      cySvg: number,
    ) => {
      if (isNonPrimaryButton(e.button)) return;
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const imp = useCanvasStore.getState().imports.find((i) => i.id === id);
      if (!imp) return;
      const pt = canvasPoint(containerRef.current, vpRef.current, e);
      if (!pt) return;
      const { x: mx, y: my } = pt;
      setRotating({
        id,
        cx: cxSvg,
        cy: cySvg,
        startAngle: Math.atan2(my - cySvg, mx - cxSvg),
        startRotation: imp.rotation,
      });
    },
    [containerRef, vpRef],
  );

  const updateScaleMove = useCallback(
    (e: MouseEvent) => {
      if (!scaling) return;
      const zoom = vpRef.current.zoom;
      const dx = (e.clientX - scaling.startMouseX) / zoom;
      const dy = (e.clientY - scaling.startMouseY) / zoom;
      updateImport(scaling.id, scalePatch(scaling, dx, dy));
    },
    [scaling, vpRef, updateImport],
  );

  const updateRotateMove = useCallback(
    (e: MouseEvent) => {
      if (!rotating) return;
      const pt = canvasPoint(containerRef.current, vpRef.current, e);
      if (!pt) return;
      const { x: mx, y: my } = pt;
      const angle = Math.atan2(my - rotating.cy, mx - rotating.cx);
      const delta = (angle - rotating.startAngle) * (180 / Math.PI);
      updateImport(rotating.id, { rotation: rotating.startRotation + delta });
    },
    [rotating, containerRef, vpRef, updateImport],
  );

  const endScale = useCallback(() => {
    setScaling(null);
  }, []);

  const endRotate = useCallback(() => {
    setRotating(null);
  }, []);

  return {
    scaling,
    rotating,
    onHandleMouseDown,
    onRotateHandleMouseDown,
    updateScaleMove,
    updateRotateMove,
    endScale,
    endRotate,
  };
}
