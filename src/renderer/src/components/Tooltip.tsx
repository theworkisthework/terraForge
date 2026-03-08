import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  /** Delay in ms before the tooltip appears. Default 800 ms. */
  delayMs?: number;
  /** Extra classes applied to the wrapper div (e.g. "flex-1") */
  className?: string;
}

/**
 * Lightweight tooltip that mimics the OS system tooltip style.
 * Renders via a portal so it is never clipped by overflow-hidden ancestors.
 * Appears bottom-right of the anchor element, matching native tooltip position.
 */
export function Tooltip({
  text,
  children,
  delayMs = 1600,
  className,
}: TooltipProps) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    timer.current = setTimeout(() => {
      if (anchorRef.current) {
        const r = anchorRef.current.getBoundingClientRect();
        setCoords({ x: r.left, y: r.bottom + 4 });
      }
    }, delayMs);
  };

  const hide = () => {
    clearTimeout(timer.current);
    setCoords(null);
  };

  const bubble = coords
    ? createPortal(
        <div
          className="pointer-events-none fixed z-[9999] whitespace-nowrap"
          style={{ left: coords.x + 12, top: coords.y + 4 }}
        >
          <div
            style={{
              background: "#f5f5f5",
              border: "1px solid #aaa",
              color: "#000",
              fontSize: "11px",
              fontFamily: "system-ui, sans-serif",
              padding: "2px 5px",
              borderRadius: "2px",
              boxShadow: "1px 1px 3px rgba(0,0,0,0.3)",
              lineHeight: "1.4",
            }}
          >
            {text}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      ref={anchorRef}
      className={`relative ${className ?? ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {bubble}
    </div>
  );
}
