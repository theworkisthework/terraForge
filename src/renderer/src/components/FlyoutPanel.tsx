import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface FlyoutPanelProps {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

export function FlyoutPanel({
  open,
  onClose,
  className,
  children,
}: FlyoutPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={panelRef} className={className}>
      {children}
    </div>
  );
}
