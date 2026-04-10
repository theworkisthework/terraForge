import { useCallback, type MutableRefObject } from "react";
import { ZOOM_STEP, ROTATE_CURSOR } from "../constants";

interface UseCanvasInteractionHandlersOptions {
  startPan: (clientX: number, clientY: number) => void;
  spaceRef: MutableRefObject<boolean>;
  zoomBy: (factor: number, clientX?: number, clientY?: number) => void;
  fitToView: () => void;
  spaceDown: boolean;
  isPanning: boolean;
  rotating: unknown;
}

export function useCanvasInteractionHandlers({
  startPan,
  spaceRef,
  zoomBy,
  fitToView,
  spaceDown,
  isPanning,
  rotating,
}: UseCanvasInteractionHandlersOptions) {
  const onContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const isPanButton = e.button === 1 || e.button === 2;
      if (isPanButton || (e.button === 0 && spaceRef.current)) {
        e.preventDefault();
        startPan(e.clientX, e.clientY);
      }
    },
    [startPan, spaceRef],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => e.preventDefault(),
    [],
  );

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

  const cursor = spaceDown
    ? isPanning
      ? "grabbing"
      : "grab"
    : isPanning
      ? "grabbing"
      : rotating
        ? ROTATE_CURSOR
        : undefined;

  return {
    onContainerMouseDown,
    onContextMenu,
    onZoomIn,
    onZoomOut,
    onFit,
    cursor,
  };
}
