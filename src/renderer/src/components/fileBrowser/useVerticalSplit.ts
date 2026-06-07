import { useCallback, useRef, useState } from "react";

interface DragState {
  startY: number;
  startPx: number;
}

export function useVerticalSplit(initialSplitPx = 200) {
  const [splitPx, setSplitPx] = useState(initialSplitPx);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startPx: splitPx };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientY - dragRef.current.startY;
        const containerHeight = containerRef.current?.clientHeight ?? 400;
        const newPx = Math.max(
          80,
          Math.min(dragRef.current.startPx + delta, containerHeight - 80),
        );
        setSplitPx(newPx);
      };

      const onMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [splitPx],
  );

  return {
    splitPx,
    containerRef,
    onDragStart,
  };
}
