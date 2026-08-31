import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_HEIGHT_PX = 160;
const MIN_HEIGHT_PX = 28;

interface UseResizablePanelOptions {
  initialHeight?: number;
  minHeight?: number;
  maxHeightFraction?: number;
}

interface UseResizablePanelReturn {
  height: number;
  minHeight: number;
  isDragging: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Vertical resize handle logic for a bottom panel.
 * Height is measured from the bottom of the container (console grows upward).
 * Constrained by a minimum pixel height and a maximum fraction of the
 * container height so the canvas area can never be fully covered.
 */
export function useResizablePanel({
  initialHeight = DEFAULT_HEIGHT_PX,
  minHeight = MIN_HEIGHT_PX,
  maxHeightFraction = 2 / 3,
}: UseResizablePanelOptions = {}): UseResizablePanelReturn {
  const [height, setHeight] = useState(initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    maxHeight: number;
  } | null>(null);

  const clampHeight = useCallback(
    (value: number, maxHeight: number) =>
      Math.max(minHeight, Math.min(value, Math.floor(maxHeight * maxHeightFraction))),
    [minHeight, maxHeightFraction],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const maxHeight = container.getBoundingClientRect().height || container.clientHeight;
      dragRef.current = {
        startY: e.clientY,
        startHeight: height,
        maxHeight,
      };
      setIsDragging(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        const rawHeight = dragRef.current.startHeight + delta;
        const nextHeight = clampHeight(rawHeight, dragRef.current.maxHeight);
        setHeight(nextHeight);
      };

      const onMouseUp = () => {
        dragRef.current = null;
        setIsDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [height, clampHeight],
  );

  // Recalculate height when the window resizes so the console never exceeds
  // the max fraction of the new viewport.
  useEffect(() => {
    const onResize = () => {
      const container = containerRef.current;
      if (!container) return;
      setHeight((current) =>
        clampHeight(current, container.getBoundingClientRect().height || container.clientHeight),
      );
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampHeight]);

  return {
    height,
    minHeight,
    isDragging,
    containerRef,
    handleMouseDown,
  };
}
