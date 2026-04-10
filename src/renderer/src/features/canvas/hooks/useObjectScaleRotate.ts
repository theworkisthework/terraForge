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
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const vp = vpRef.current;
      const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
      const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
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
      const h = scaling.handle;

      if (scaling.ratioLocked) {
        // Locked: uniform scale
        let delta = 0;
        if (h === "tl" || h === "bl") delta = -dx;
        else if (h === "tr" || h === "br") delta = dx;
        else if (h === "t") delta = -dy;
        else if (h === "b") delta = dy;
        else if (h === "r") delta = dx;
        else if (h === "l") delta = -dx;
        const dimPx = h === "t" || h === "b" ? scaling.startH : scaling.startW;
        const rawScale = Math.max(
          0.001,
          scaling.startScale * (1 + delta / dimPx),
        );
        updateImport(scaling.id, {
          scale: rawScale,
          scaleX: undefined,
          scaleY: undefined,
        });
      } else {
        // Unlocked: drive each axis independently
        const affectsX =
          h === "l" ||
          h === "r" ||
          h === "tl" ||
          h === "tr" ||
          h === "br" ||
          h === "bl";
        const affectsY =
          h === "t" ||
          h === "b" ||
          h === "tl" ||
          h === "tr" ||
          h === "br" ||
          h === "bl";
        const deltaX = h === "r" || h === "tr" || h === "br" ? dx : -dx;
        const deltaY = h === "b" || h === "br" || h === "bl" ? dy : -dy;
        const patch: { scaleX?: number; scaleY?: number } = {};
        if (affectsX)
          patch.scaleX = Math.max(
            0.001,
            scaling.startScaleX * (1 + deltaX / scaling.startW),
          );
        if (affectsY)
          patch.scaleY = Math.max(
            0.001,
            scaling.startScaleY * (1 + deltaY / scaling.startH),
          );
        updateImport(scaling.id, patch);
      }
    },
    [scaling, vpRef, updateImport],
  );

  const updateRotateMove = useCallback(
    (e: MouseEvent) => {
      if (!rotating) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const vp = vpRef.current;
      const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
      const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
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
