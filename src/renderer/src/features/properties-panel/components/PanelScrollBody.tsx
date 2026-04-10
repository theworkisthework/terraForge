import type { ReactNode } from "react";

interface PanelScrollBodyProps {
  children: ReactNode;
}

/** Scrollable body area that fills remaining height below the panel heading. */
export function PanelScrollBody({ children }: PanelScrollBodyProps) {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
  );
}
