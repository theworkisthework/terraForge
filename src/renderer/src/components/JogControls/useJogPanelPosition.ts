import { useEffect, useRef, useState } from "react";

/**
 * Where the floating jog panel sits, and the pointer handlers for dragging
 * it by its grip. Until first dragged it uses its CSS default position;
 * after that it is kept on screen and at least `minRightInset` px clear of
 * the right edge (the properties panel, and the ruler when it is on the
 * right), even as that inset changes.
 */
export function useJogPanelPosition(minRightInset: number) {
  // null = use CSS default (aligned with right panel + 16px gap); set when user first drags
  const [jogPos, setJogPos] = useState<{ x: number; y: number } | null>(null);
  const jogPanelRef = useRef<HTMLDivElement>(null);
  const jogDragRef = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
  } | null>(null);

  // Keep dragged jog panel clear of the right-side reserved UI area when
  // panel widths or machine origin change (which moves the ruler side).
  useEffect(() => {
    if (!jogPos || !jogPanelRef.current) return;
    const width = jogPanelRef.current.offsetWidth || jogPanelRef.current.getBoundingClientRect().width;
    const maxX = Math.max(0, window.innerWidth - width - minRightInset);
    if (jogPos.x > maxX) {
      setJogPos((prev) => (prev ? { ...prev, x: maxX } : prev));
    }
  }, [minRightInset, jogPos]);

  const startJogDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // Resolve current pixel position from either state or the element's bounding rect
    const panel = jogPanelRef.current;
    const rect = panel?.getBoundingClientRect();
    jogDragRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: rect?.left ?? window.innerWidth - 270,
      startY: rect?.top ?? 48,
    };
    // Anchor position state so subsequent moves work correctly
    if (!jogPos && rect) {
      setJogPos({ x: rect.left, y: rect.top });
    }
  };
  const onJogDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!jogDragRef.current || !jogPanelRef.current) return;
    const { offsetWidth: w, offsetHeight: h } = jogPanelRef.current;
    const newX = jogDragRef.current.startX + e.clientX - jogDragRef.current.mouseX;
    const newY = jogDragRef.current.startY + e.clientY - jogDragRef.current.mouseY;
    setJogPos({
      x: Math.max(0, Math.min(window.innerWidth - w - minRightInset, newX)),
      y: Math.max(0, Math.min(window.innerHeight - h, newY)),
    });
  };
  const onJogDragEnd = () => {
    jogDragRef.current = null;
  };

  return { jogPos, jogPanelRef, startJogDrag, onJogDragMove, onJogDragEnd };
}
